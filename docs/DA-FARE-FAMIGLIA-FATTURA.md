# Da fare — Famiglia Fattura e righe documento

**Documento di lavoro, 16/08/2026.** Non è una specifica: le specifiche sono `07` (famiglia
Fattura), `03b` (righe documento), `04` (numerazione), `06b` (fattura elettronica). Qui c'è
**cosa resta da fare**, in ordine, con le misure già prese e il perché di ciascuna scelta.

Si aggiorna man mano che le voci si chiudono. Quando è vuoto, si cancella.

---

## Come leggere le voci

| Stato                 | Significato                                                 |
| --------------------- | ----------------------------------------------------------- |
| 🔵 **PRONTO**         | misurato, la regola è decisa, si può scrivere codice        |
| 🟡 **DA DECIDERE**    | misurato, ma manca una scelta di dominio che spetta a Luigi |
| 🔴 **DIFETTO ATTIVO** | non è una funzione mancante: qualcosa oggi si comporta male |
| ⚪ **DA MISURARE**    | non ancora guardato abbastanza per stimarlo                 |

Ogni voce dice **da dove ricominciare** se ci si ferma a metà.

---

## 1 · Collegamenti Fattura ↔ Nota di credito — 🟡 il prossimo

**Perché per primo:** senza la relazione con l'origine, la Nota di credito non è una nota di
credito — è una fattura col segno girato. E tutto il resto del dominio NC (segno, magazzino)
poggia su questa.

### Cosa è già misurato

Il blocco «documento collegato» di FatturaPA ha **sei voci**; VestiFlow ne ha **una**:

| Voce                       | Tracciato | Stato                                       |
| -------------------------- | --------- | ------------------------------------------- |
| `DatiOrdineAcquisto`       | 2.1.2     | assente                                     |
| `DatiContratto`            | 2.1.3     | assente                                     |
| `DatiConvenzione`          | 2.1.4     | assente                                     |
| `DatiRicezione`            | 2.1.5     | assente                                     |
| **`DatiFattureCollegate`** | 2.1.6     | **assente — ed è quella che serve alla NC** |
| `DatiDDT`                  | 2.1.8     | **presente e funzionante**                  |

In Danea non sono campi sparsi: sono **un menu solo**, «Doc. emesso in seguito a», con le sei
voci e i campi N. / del / CIG / CUP accanto. Noi ne offriamo una sola, e la maschera la
presenta come se fosse l'unica possibile — per questo sulla Nota di credito compare
«Riferimento DDT», che è il difetto apparente dietro cui c'è la causa vera.

### Cosa va presentato prima di implementare

**Le sei componenti, distinguendo** — richiesta esplicita di Luigi, 16/08:

1. cosa esiste;
2. cosa manca;
3. cosa serve alla **gestione ordinaria** (leggere in elenco, aprire l'origine, capire cosa
   storna cosa);
4. cosa serve **specificamente alla FE** (`DatiFattureCollegate`);
5. cosa riguarda la **NC generata da una Fattura VestiFlow**;
6. cosa serve alla **NC riferita a una fattura esterna o storica** — che non è un documento
   nostro, quindi numero e data si digitano.

**La soluzione «Fattura collegata» non è approvata**: è la voce del tracciato che
corrisponde al bisogno, non ancora il disegno.

### Vincolo già scritto nelle specifiche

`07` §13 chiede che una NC generata da una Fattura conservi una **relazione strutturata** con
l'origine e i **suoi snapshot storici**. Il solo testo visibile non basta.

**Da dove si ricomincia:** dal censimento delle sei voci, in lettura.

---

## 2 · I campi che l'inclusione non trasporta — 🔵 pronto, con una regola decisa

**Misurato:** l'inclusione **non ricarica** dal catalogo (bene), ma il carico porta **8 campi**
su quelli che l'operatore può digitare.

Portati: `variantId · sku · barcode · description · quantity · unitPriceMinor · discount · vatCodeId`

| Campo che cade              | Decisione                                                           |
| --------------------------- | ------------------------------------------------------------------- |
| **`unitOfMeasure`**         | 🔵 **va portato.** È un dato del documento, digitato dall'operatore |
| **`loadsStock`**            | 🟡 da decidere: è del tipo documento o della riga?                  |
| `lotCode` · `lotExpiryDate` | 🔵 **NON va portato** — vedi voce 3                                 |
| `serialNumbers`             | 🔵 **NON va portato** — stessa regola                               |

⚠️ **L'unità di misura si perde due volte**, e la seconda è peggiore: la maschera vendita non
la manda al salvataggio e `computeLines` scrive `null`. Quindi una fattura che l'ha ereditata
da un DDT **la perde al primo salvataggio**, in silenzio. Entra nella voce 5.

**Da dove si ricomincia:** da `document-include.util.ts`, `IncludedDocumentLine`.

---

## 3 · La scelta del lotto in uscita — 🔵 regola decisa, funzione da costruire

> **Il lotto non si trascina: si sceglie nel documento che movimenta il magazzino.**

Confermato osservando Danea (16/08): includendo un ordine in un DDT, è **il DDT** a chiedere
quale lotto, e **solo se ce n'è più di uno disponibile con giacenza positiva**.

**Il perché è di dominio, non di interfaccia:** il lotto è un fatto del magazzino **nel
momento dell'uscita**, non un'intenzione espressa quando si è preso l'ordine. Fra l'ordine e
la consegna quel lotto può essere finito, scaduto, o essere stato venduto ad altri.

### Cosa esiste e cosa manca

| Pezzo                                                      | Stato             |
| ---------------------------------------------------------- | ----------------- |
| `InventoryLot` (variante, sede, lotto, scadenza, quantità) | ✅ esiste         |
| `DocumentLine.lotCode` / `lotExpiryDate`                   | ✅ esistono       |
| Arrivo merce: inserimento del lotto in riga                | ✅ esiste         |
| **Endpoint «lotti disponibili per variante e sede»**       | ❌ **non esiste** |
| **Scelta del lotto nelle maschere di vendita e DDT**       | ❌ **non esiste** |

### Come deve comportarsi

- **Un solo lotto disponibile → si prende quello**, senza chiedere. La domanda è un costo, e
  si paga solo quando c'è davvero una scelta.
- **Più lotti → si chiede**, mostrando numero, scadenza e **quantità disponibile**, come fa
  la finestra «Ricerca lotto in giacenza» di Danea.
- **Nessun lotto disponibile** → è un avviso, non un blocco (regola dei controlli: warning
  non bloccanti, salvo integrità dei dati).
- Vale identico per le **matricole**, dove però la quantità è sempre uno per pezzo.

**Da dove si ricomincia:** dall'endpoint, che è il pezzo mancante a monte di tutto.

---

## 4 · Il dominio della Nota di credito — 🟡 dopo la voce 1

Il tipo esiste ovunque (registro, rotte, numeratore, permessi, migration applicate). **Il suo
dominio no.**

| Cosa                                                    | Stato                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Verso economico — importi positivi, segno dato dal tipo | `07` §6, non iniziato                                                 |
| Casella «Carica magazzino» per riga, default spento     | `07` §6, da innestare sul percorso per riga di `09`                   |
| Tipo movimento `return`                                 | da confermare in implementazione                                      |
| **Censimento del segno nelle aggregazioni**             | `07` §16, **dichiarato da fare** — e va **prima** del verso economico |
| Primo test reale di una NC                              | mai fatto: prima non si poteva, il database non conosceva il tipo     |

⚠️ **Il censimento del segno viene prima.** Rendere la NC visibile nelle aggregazioni senza
applicare il segno la fa sommare come una fattura in più: il commercialista leggerebbe uno
storno come un ricavo.

---

## 5 · Le cinque colonne della riga Fattura — 🔴 contiene una perdita di dati

`07` §17. La riga Fattura ha `variantId · description · quantity · unitPrice · vatCodeId ·
discountPercent · loadsStock`. Rispetto a DDT e Ordine cliente mancano cinque colonne, **di
natura diversa fra loro**:

| Colonna          | Natura                                          |
| ---------------- | ----------------------------------------------- |
| Q.tà disponibile | informazione gestionale: si legge, non si salva |
| Costo d'acquisto | idem, e solo col permesso «Visualizza costi»    |
| **U.m.**         | **dato del documento** — vedi sotto             |
| Prezzo scontato  | lettura economica, derivata                     |
| Totale riga      | calcolato, non editabile                        |

🔴 **L'unità di misura non è «non mostrata»: viene cancellata.** La colonna esiste, il DTO
l'accetta, il servizio la trasporta — ma la maschera non ha il controllo e **non la manda**,
e `computeLines` scrive `null` quando manca. Una fattura che l'ha ereditata da un DDT **la
perde al primo salvataggio**.

**Vincolo:** si usa `DocumentLine.unitOfMeasure`, che c'è. Nessun secondo campo. E si riusano
le celle esistenti (`app-document-line-unit-cell`) e le formule condivise: una seconda copia
dei calcoli dentro la Fattura sarebbe il difetto, non la funzione.

---

## 6 · Il prezzo al pubblico nell'Arrivo merce — 🔴 oggi si digita e sparisce

**Misurato:** per un articolo **già esistente**, il prezzo al pubblico scritto in riga **non
va da nessuna parte**. Non aggiorna l'anagrafica e non viene salvato sul documento.

Tre punti chiudono la catena:

- il servizio scrive `sellingPriceMinor` **solo alla creazione** (`if (line.variantId ||
!line.newProduct) continue`);
- il frontend costruisce il carico `newProduct` **solo** se la riga non ha `variantId`;
- `DocumentLine` **non ha** una colonna prezzo di vendita.

**Non è «non aggiorna»: è un campo che invita a un gesto senza effetto.**

**Decisione di Luigi (16/08):** dovrebbe aggiornare l'anagrafica anche per gli articoli
esistenti — accelera il carico ed è il momento in cui quel prezzo si stabilisce davvero.

### E il prezzo Shopify, con un'avvertenza

`ProductVariant.shopifyPriceMinor` esiste, e lo schema dichiara: _«Prezzo Shopify per-taglia,
**INDIPENDENTE** dal prezzo articolo. La pubblicazione legge **solo questo**»_. Nell'Arrivo
merce **non c'è nessuna colonna** per esso.

⚠️ **Non «la stessa logica»:** quel prezzo è **per-taglia e indipendente**. Trattarlo come un
gemello del prezzo articolo distrugge proprio l'indipendenza che lo schema dichiara. Va
deciso come si comporta quando i due divergono.

---

## 7 · Il netto/ivato sul «Prezzo al pubblico» — 🟡 il componente c'è, la semantica no

Il componente esiste (`app-price-mode-menu`, `07` §25) e la regola generale è fissata: **Costo
sugli acquisti, Prezzo sulle vendite**.

Resta fuori `sellingPrice`, la colonna «Prezzo al pubblico», che non dice se è netta o ivata —
e chi lavora all'ingrosso ha bisogno di leggerla nell'uno o nell'altro modo.

⚠️ **Significa due cose diverse nelle due maschere**, e va deciso prima:

| Maschera         | `sellingPrice`   | Cosa sarebbe il selettore                     |
| ---------------- | ---------------- | --------------------------------------------- |
| Ordine fornitore | **sola lettura** | un **cambio di vista**                        |
| Arrivo merce     | **editabile**    | un **modo di inserimento**, come già il Costo |

---

## 8 · Il prezzo digitato a mano non si muove — ⚪ da misurare bene

**Regola dichiarata da Luigi (16/08):** un prezzo che l'operatore ha scritto **è suo e non si
muove mai** — né col cambio netto/ivato, né quando la riga si riporta altrove. Si ripristina
**solo** in due casi: se l'articolo viene **ricercato di nuovo sulla stessa riga**, o se la
riga viene **eliminata e rifatta**.

**Già conforme:** il cambio netto/ivato converte per aliquota, quindi l'importo effettivo non
cambia — mostra lo stesso prezzo in un altro modo.

**Non conforme:** il cambio del **listino in testata** riscrive i prezzi, e lo fa in **due modi
diversi** — l'Ordine cliente salta le righe di riferimento, la maschera vendita non salta
niente.

⚪ **Manca il dato che rende la regola implementabile:** la riga non registra se il suo prezzo
è stato toccato a mano. Senza, il codice non può distinguere un 10 € negoziato da un 10 €
proposto. Serve un indicatore **in memoria** — non va salvato, basta che viva nella maschera.

---

## 9 · Coda già registrata, fuori da questo blocco

| Voce                                           | Dove       | Perché è fuori                                                                                                               |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sigla e zeri fuori dal numero visibile         | `04` §11   | ferma su 3 decisioni di Luigi **e sul backup**: normalizzare le 104 `reference` cancella le prove su cui poggia la decisione |
| Numerazione Vendita online e Corrispettivi     | `04` §8    | blocco proprio, da coordinare con `feature/cassa`                                                                            |
| Rename `invoice_draft` + pulizia ciclo fiscale | `07` §21   | col merge del collega e dentro il blocco FE                                                                                  |
| **La «Causale» che non arriva nell'XML**       | `06b` §H.1 | difetto reale, ma è del blocco FE — tenuto separato finché il dominio documentale non è stabile                              |
| Analytics: i DDT non sono vendite              | `04` §8    | mai aperto                                                                                                                   |

---

## Ordine deciso

1. **Collegamenti Fattura ↔ NC** (voce 1) — censimento delle sei voci, poi disegno
2. poi le altre, nell'ordine che Luigi sceglierà voce per voce

**Regola di lavoro, imparata due volte oggi:** ogni voce comincia **misurando**, non
eseguendo. Le due regressioni del 16/08 — il menu «Nuovo» esteso senza guardarlo, e «Listino»
rinominato su una premessa non verificata — sono nate entrambe dall'aver trattato una
premessa come un fatto.
