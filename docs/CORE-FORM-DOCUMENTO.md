# Core condiviso dei form documento — stato e mappa del residuo

Nota di lavoro sull'estrazione del nucleo comune fra i form documento
(Ordine cliente, Arrivo merce e, a seguire, DDT e fatture).

Ultimo aggiornamento: 2 agosto 2026.

---

## ⭐ Che cosa è successo dopo — 24/08/2026

⚠️ **Questa nota è di agosto e descrive due maschere**; nel frattempo il lavoro si è
esteso a **otto**, e la parte del leone l'ha fatta la riga. Qui resta il **metodo**, che
non è cambiato ed è la ragione per cui la nota vale ancora: caratterizzare, estrarre una
fetta, verificare che i test restino verdi.

La regola che questa nota cita — _«Form documentali: testata a celle unite, riga
editabile, riepilogo totali, barra azioni — un componente per pattern, riusato da ogni
tipo documento»_ — è il piano di lavoro, e a oggi è **a metà**:

| Pattern          | Stato                                                               |
| ---------------- | ------------------------------------------------------------------- |
| riga editabile   | ✅ `document-line-row` + `document-line-card-*`, tutte e sette      |
| **testata**      | 🔄 `document-header` — vedi `SPECIFICA-COMUNE-TESTATE-DOCUMENTO.md` |
| riepilogo totali | ⏳ classi comuni, markup ripetuto in sei maschere                   |
| barra azioni     | ⏳ classi comuni, markup ripetuto in otto                           |

⛔ **Il residuo elencato più sotto è quello di agosto**, e va riverificato prima di
agirci: diverse voci sono state chiuse dal lavoro sulle righe. La sezione «Come misurare
di nuovo» in fondo dice come.

## Perché esiste questa nota

`customer-order-form.component.ts` (4.186 righe) e
`goods-receipt-form.component.ts` (4.849 righe) implementano due volte la
stessa macchina: una griglia di righe documento con ricerca prodotto,
calcolo IVA, sconti, numerazione e uscita protetta.

Le regole di progetto lo vietano esplicitamente (`regole-architettura`,
sezione «Catalogo dei pattern che DEVONO essere componenti»): _«Form
documentali: testata a celle unite, riga editabile, riepilogo totali,
barra azioni — un componente per pattern, riusato da ogni tipo
documento»_.

La duplicazione non è nata da copia-incolla ma per **prelievo
opportunistico**: quando all'Ordine cliente serviva un pezzo, prendeva
quello dell'Arrivo merce o lo riscriveva. Il risultato è lo stesso codice
con nomi diversi in due posti.

---

## Metodo adottato

Non si rifattorizza codice non coperto. L'ordine è:

1. **Caratterizzare** — test che fotografano il comportamento attuale,
   non quello desiderato. I valori attesi si calcolano a mano dalla
   specifica di dominio, così un test che fallisce distingue «il
   refactor ha rotto qualcosa» da «il comportamento era già diverso da
   come lo immaginavo».
2. **Estrarre** una fetta alla volta in `domain/documents/utils/`.
3. **Verificare** che i test di caratterizzazione restino verdi. È la
   prova che l'estrazione non ha cambiato comportamento.

Ha già dato un risultato concreto: batchando una lettura nel magazzino
era stato introdotto un bug (giacenza letta in blocco invece che per
riga, con la seconda rettifica sulla stessa variante che partiva da un
valore stale). Un test l'ha fermato prima del commit.

---

## Fatto

| Fetta                                   | Dove                                                                                                | Test |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ---- |
| Caratterizzazione totali                | `customer-order-form.component.spec.ts`                                                             | 12   |
| Caratterizzazione totali                | `goods-receipt-form.component.spec.ts`                                                              | 7    |
| Algoritmo totali                        | `domain/documents/utils/document-totals.util.ts`                                                    | 11   |
| Opzioni Codice IVA riga                 | `domain/documents/utils/document-vat-options.util.ts`                                               | 7    |
| Tastiera delle celle di riga            | `domain/documents/utils/document-line-cell-keys.util.ts`                                            | 8    |
| Cella a ricerca-e-selezione (IVA, U.M.) | `domain/documents/components/document-line-select-cell/`                                            | 13   |
| Filtro a precedenza-codice              | `domain/documents/utils/document-line-select-filter.util.ts`                                        | 5    |
| Unità di misura di riga                 | `domain/documents/components/document-line-unit-cell/` + `domain/products/` (elenco, pannello, API) | 3    |

L'algoritmo dei totali era duplicato e divergeva su un solo punto: come
si decide se l'IVA di una riga concorre al totale. Nell'Ordine cliente
era implicito (aliquota > 0), nell'Arrivo merce esplicito
(`vatAffectsSupplierTotal`, per il reverse charge). Ora è un dato in
ingresso e l'algoritmo è uno.

---

## Residuo: 34 metodi, ~690 righe

Misurato confrontando i corpi normalizzati dei metodi omonimi (soglia di
similarità 75%). I cluster, in ordine di valore:

### 1. Pannello prodotto — ~100 righe, 85-100%

`openNewProduct`, `closeProductPanel`, `openProductAnagraphic`,
`openProductDetail`, `onProductCreatedFromPanel`,
`onProductUpdatedFromPanel`, `onProductSavedWithoutAttach`,
`dismissAttachPendingVariant`.

È il candidato migliore ma **non è logica pura**: manovra 5+ signal di
stato, chiama `ProductService` e scrive nello stato di errore del form.
Estrarlo bene significa decidere fra:

- un **componente condiviso** che incapsula pannello + stato (ha UI,
  quindi va verificato a video), oppure
- un **piccolo store di feature** (signal store) che i due form
  compongono, lasciando il markup dove sta.

È una decisione di design, non una deduplica meccanica: va presa
guardando il pannello, non solo il codice.

### 2. Ricerca prodotto in riga — ~40 righe, 89-100%

`onLineProductFocus`, `onLineProductNameChange`, `closeLineProductSearch`,
`clearProductAutocomplete`, `onLineProductSearchPick`,
`onLineBarcodeChange`.

Stessa natura del punto 1, più piccolo. Naturale da fare insieme.

### 3. Dialog conflitto numerazione — ~40 righe, 82-100%

`dismissConflictDialog`, `confirmConflictNumber`, `onSeriesChange`,
`onSeriesManagerClosed`.

Buon candidato a componente condiviso: è un dialog con stato proprio e
un contratto stretto (numero proposto, esito).

### 4. Navigazione tastiera fra celle — ~45 righe, 78-100%

`focusLastLineField`, `focusNextLineField`, `focusPreviousLineField`,
`advanceToNextLine`, `onLineFieldKeydown`.

> ⚠️ **Superato: estratto l'11/08/2026.** Questa voce diceva «da NON estrarre
> così com'è» e rimandava «a quando si decide quale delle due navigazioni è
> quella giusta». La decisione è stata presa — sta in
> `docs/03-specifica-unificazione-righe-documento.md` — e il punto unico
> esiste: `DocumentLineFocusStore` in `domain/documents/state/`, classe-campo
> generica sul tipo del campo, con un contratto di **dieci voci** che la
> maschera fornisce.
>
> **La stima che reggeva il «no» era vecchia**: parlava di due maschere e ~45
> righe. Erano **tre** maschere e circa **seicento** righe, e divergevano già —
> le frecce funzionavano in una sola, la guardia di sola-lettura mancava in
> un'altra, un identificativo puntava a un elemento inesistente. Il timore
> dell'astrazione prematura era giusto in linea di principio e sbagliato sui
> numeri: la scelta non era fra estrarre e non estrarre, ma fra un punto solo e
> la quarta copia.
>
> Ciò che ha evitato «la flag che tiene insieme due comportamenti diversi»: le
> differenze vere sono passate come **dati** (le dieci voci del contratto), non
> come condizioni dentro la classe.
>
> Il testo qui sotto resta per la storia.

**Da NON estrarre così com'è.** È aritmetica su indici di 5-11 righe,
accoppiata al DOM, e le due versioni divergono davvero: l'Ordine cliente
risale alla riga precedente inline, l'Arrivo merce delega a
`advanceToPreviousLine`. Unificarle richiederebbe una flag che tiene
insieme due comportamenti diversi — l'anti-pattern che
`regole-architettura` chiama «astrazione prematura». Va rivisto quando
si decide quale delle due navigazioni è quella giusta.

### 5. Predicati di riga — ~~estraibili~~ **in gran parte falsi positivi**

`lineVariantSummary`, `lineRowComplete`, `lineHasDiscount`,
`lineGrossMoney`, `lineUnitOfMeasure`, `totalPiecesCount`.

Una prima lettura li dava come «piccoli e quasi puri, estraibili con lo
stesso metodo dei totali». **Guardandoli davvero, è sbagliato**: la
metrica di similarità misura la forma del corpo, non la regola che
codifica, e qui i corpi si somigliano mentre le regole differiscono.

| Metodo              | Ordine cliente                       | Arrivo merce               |
| ------------------- | ------------------------------------ | -------------------------- |
| `lineHasDiscount`   | sconti a cascata (`"10+5"`)          | percentuale singola        |
| `lineRowComplete`   | prodotto **+ quantità > 0**          | prodotto **+ costo**       |
| `totalPiecesCount`  | salta anche le righe «riferimento»   | non ha righe riferimento   |
| `lineUnitOfMeasure` | fallback sull'unità digitata in riga | solo quella della variante |

Sono differenze **volute**: un arrivo merce senza costo è incompleto, un
ordine cliente senza quantità sì. Unificarle richiederebbe di passare
predicati e accessor, cioè un'API più grande del corpo che sostituisce —
e nel caso peggiore di fondere due regole di business diverse.

**Non estrarre.** È il caso da tenere a mente quando si legge questa
mappa: la percentuale di similarità è un indizio su dove guardare, non
una prova che due cose siano la stessa cosa.

Unica eccezione già applicata: `lineVariantSummary` era identico e per
giunta ripetuto in **cinque** form (i due grandi più `stock-operation`,
`transfer`, `supplier-order`). È diventato `findVariantSummaryById` in
`domain/products/utils/variant-summary-search.util.ts`.

---

## Come misurare di nuovo

Lo script che produce questa mappa confronta i corpi normalizzati dei
metodi omonimi fra due componenti. Non è nel repository perché è
usa-e-getta: si riscrive in venti righe. L'idea è normalizzare (via
commenti, spazi e i nomi che differiscono di sicuro fra i due form) e
misurare la sovrapposizione dei token.
