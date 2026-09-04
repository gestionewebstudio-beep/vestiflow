# Matrice delle maschere documento

**Dodici maschere, quattordici assi di divergenza.** Analisi in sola lettura del
13/08/2026: nessun file è stato modificato durante la lettura, e ogni divergenza è stata
verificata da un secondo lettore indipendente prima di finire in questo elenco.

Serve a una cosa sola: **decidere cosa deve convergere e cosa resta diverso**. Non
propone allineamenti — dice cosa fa oggi ciascuna maschera, con `file:riga`, e distingue
sempre **ciò che è verificato** da ciò che è dedotto.

Le maschere sono dodici e non dieci perché tre componenti ne servono più d'una:
`customer-order-form` copre Ordine cliente, Preventivo, DDT vendita e Vendita manuale;
`sales-document-form` copre Proforma, Fattura e Fattura accompagnatoria;
`stock-operation-form` copre la sola Rettifica (non esiste una maschera «Inventario»
separata: la rotta si chiama `adjustment`, il titolo di rotta dice «rettifica
inventario», l'H1 dice «rettifica di magazzino»).

---

## La matrice

Legenda: ✅ come la maggioranza · ⚠️ diverge · ✅→ corretto il 13/08 (vedi «Cosa è già
cambiato»). Le celle sono verdetti brevi; il dettaglio con le righe esatte sta
nell'elenco delle divergenze.

| Maschera                | Quando propone        | Ricalcolo su data | Origine del tipo    | Serie su cambio sede | Campo sede                        | Numero digitato in modifica | Cambio serie rinumera | «già numerato» da cosa | `track` righe   |
| ----------------------- | --------------------- | ----------------- | ------------------- | -------------------- | --------------------------------- | --------------------------- | --------------------- | ---------------------- | --------------- |
| Arrivo merce            | ⚠️ costruttore        | ✅→ sì            | ⚠️ FormControl      | ✅ sì                | ✅ «Location destinazione»        | ⚠️ ignorato                 | ⚠️ riferimento fermo  | ⚠️ esistenza documento | ✅ oggetto      |
| Registrazione fattura   | ✅ `afterNextRender`  | ✅→ sì            | ✅ costante         | — (nessuna sede)     | ⚠️ **assente, per decisione**     | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Ordine cliente          | ✅ `afterNextRender`  | ✅→ sì            | ✅→ modalità        | ✅ sì                | ✅ «Location di origine»          | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Preventivo              | ✅ `afterNextRender`  | ✅→ sì            | ✅ modalità         | ✅ sì                | ✅ «Location»                     | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| DDT vendita             | ✅ `afterNextRender`  | ✅→ sì            | ✅ modalità         | ✅ sì                | ✅ obbligatoria anche lato server | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Vendita manuale         | ✅ `afterNextRender`  | ✅→ sì            | ✅ modalità         | ✅ sì                | ✅ unico campo obbligatorio       | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Ordine fornitore        | ⚠️ costruttore        | ✅→ sì            | ✅ costante         | ✅ sì                | ✅ «Sede»                         | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ⚠️ **`$index`** |
| Trasferimento           | ✅ `afterNextRender`  | ✅→ sì            | ✅ costante         | ✅ sì                | ✅ due sedi                       | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Rettifica               | ✅ `afterNextRender`  | ✅→ sì            | ✅ dati di rotta    | ✅ sì                | ✅ unico campo del gate           | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Proforma                | ✅ `afterNextRender`  | ✅→ sì            | ✅ dati di rotta    | ✅ sì                | ✅                                | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Fattura                 | ✅ `afterNextRender`  | ✅→ sì            | ✅ dati di rotta    | ✅ sì                | ✅                                | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |
| Fattura accompagnatoria | ⚠️ **proposta vuota** | ✅→ sì            | ⚠️ rotta senza tipo | ✅ sì                | ✅                                | ✅ rispettato               | ✅ sì                 | ✅ rotta               | ✅ oggetto      |

Assi su cui **tutte e dodici si comportano uguale**, e vale la pena saperlo perché sono
il risultato del lavoro dei giorni scorsi: il numero è editabile in testata; la proposta
non viaggia al salvataggio (viaggia solo il numero digitato); il cambio serie riscrive
il numero dallo store condiviso; la sede si precompila con `prefillDefaultLocation`
(regola unica in `domain/inventory/utils/`); l'avviso di conflitto e quello cronologico
passano dagli stessi due componenti di `domain/`.

---

## Le divergenze, in tre gruppi

### Gruppo 1 — hanno una ragione dichiarata

Sono tre, e in due casi la «ragione» dice che la questione è aperta, non che il
comportamento è giusto. È una differenza che conta: la prima si può chiudere leggendo,
le altre due richiedono una decisione.

**1.1 · L'Arrivo merce deduce «già numerato» dall'esistenza del documento, non dalla
rotta.** _(ragione scritta in tre posti: commento, test, §9 della specifica numerazione)_
Questa maschera dopo «Salva documento» **resta aperta**, quindi un documento salvato
continua a vivere sulla rotta di creazione, dove le altre non arrivano mai. Con la sola
rotta la riproposta dei contatori riporterebbe il campo dal numero assegnato a quello
proposto prima — ed è misurato da un test che fallisce senza la condizione in più.
**Divergenza corretta, da non toccare.**

**1.2 · L'Arrivo merce in modifica ignora il numero digitato.**
_(`04-…§10`: «Arrivo merce in modifica: oggi ignora numero digitato e cambio serie»)_
La ragione esiste ma **registra**, non giustifica: è una voce «fuori perimetro» che
vieta di correggere senza chiedere. Il client manda comunque il numero, il server salta
l'intero blocco di numerazione (`if (number == null)`), e nessuno dice niente
all'operatore.

**1.3 · Nell'Arrivo merce il cambio serie non ricompone il riferimento.**
Stessa voce di §10, stesso stato: il documento finisce con `series = 'B'` e
`reference = 'AM-A-0042'`. Elenco e stampa contraddicono la colonna.

---

### Gruppo 2 — la ragione è plausibile ma **non è scritta da nessuna parte**

Qui la divergenza si spiega da sé una volta capita, ma nessun commento, test o riga di
specifica la dichiara: chi ci arriva fra sei mesi deve ricostruirla.

**2.1 · Registrazione fattura senza campo Sede.** Unica delle sette. La ragione è una
decisione di prodotto presa il 12/08 (la fattura è intestata alla società, una partita
IVA, un registro acquisti; una sola fattura può coprire arrivi in sedi diverse) —
**ora è scritta**, nel §1-bis della specifica numerazione. Prima di quel giorno non lo era.

**2.2 · Due maschere chiedono i contatori nel costruttore, cinque in `afterNextRender`.**
Non è stilistico: nel costruttore la richiesta parte **prima** che l'effect di
`prefillDefaultLocation` abbia scritto la sede, quindi il primo `available()` viaggia con
`locationId` vuoto e la tendina serie si popola una seconda volta solo grazie alla
sottoscrizione sul cambio sede. Funziona, ma per rimbalzo.
_(costruttore: `goods-receipt-form.component.ts:1047`, `supplier-order-form.component.ts:990`)_

**2.3 · Quattro origini diverse per «di che tipo è questo documento».** FormControl
(Arrivo merce), dati di rotta (Rettifica, Proforma/Fattura/Accompagnatoria), costante di
classe (Registrazione fattura, Ordine fornitore, Trasferimento), costante da modalità
(le quattro di `customer-order-form`). L'Arrivo merce è l'unica a leggerlo da un
FormControl, e quel controllo **non ha alcun campo nel template**: in creazione vale
sempre `goods_receipt`.

**2.4 · Trasferimento e Rettifica non mandano `series` sul percorso di creazione.**
Hanno due contratti di salvataggio: quello dedicato manda la serie, quello create/PATCH —
cioè **ogni documento nuovo** — non contiene affatto la chiave. Su un documento nuovo la
scelta della tendina non arriva al server, che risolve con `defaultCounterSeries`; su una
bozza il numero della serie nuova viaggia e la serie no, quindi il documento resta nella
serie vecchia col numero della nuova. Il tipo del body la chiave la prevede.
_(`transfer-form.component.ts:1532-1554`, `stock-operation-form.component.ts:1519-1542`)_

**2.5 · L'Ordine fornitore considera «serie cambiata» la sola presenza della chiave.**
Gli altri confrontano col valore corrente. Poiché in modifica il client manda sempre la
serie, **ogni risalvataggio** entra nel ramo che riscrive numero, serie e riferimento
anche quando nulla è cambiato. _(`supplier-orders.service.ts:298`)_

**2.6 · L'Ordine fornitore traccia le righe con `$index`.** Le altre undici tracciano
l'oggetto. Con il riordino per trascinamento appena introdotto è il caso da verificare
per primo quando si aprirà `bugfix/righe-documento` — è già registrato lì
(`03b-mappa-tecnica-righe-documento.md` §9, voce 13), **non va toccato qui**.

---

### Gruppo 3 — nessuna ragione visibile

Nessun commento, nessun test, nessuna riga di specifica. Sono i candidati veri.

**3.1 · La Fattura accompagnatoria apre con la testata senza numero e senza serie.**
Numera sotto il numeratore della Fattura (`documentNumberingType` la rimappa), ma la
maschera chiede i contatori col tipo grezzo `invoice_accompanying`. Lato server
`available()` filtra sul tipo grezzo, e quel tipo **non viene mai seminato** — è escluso
dai configurabili, e `create` lo rifiuta con 422. Risultato: elenco vuoto, nessun
`proposedCounterId`, campo Numero vuoto e Serie non scegliibile. La **scrittura** invece
risolve bene, perché `defaultCounterSeries` rimappa. È l'unica delle dodici che apre
senza proposta.
_(`sales-document-form.component.ts:497` · `document-counters.service.ts:156-164` ·
`document-defaults.ts:89-92`)_

**3.2 · Proforma, Fattura e Accompagnatoria condividono una rotta di modifica che non
porta il tipo.** Finché il documento non è arrivato dalla rete, `documentType()` cade sul
predefinito `Proforma` per tutti e tre — e quel valore è già quello con cui il contratto
della cronologia e la proposta interrogano. Tutte le altre hanno una rotta per tipo, o un
tipo fisso. _(`documents.routes.ts:294-302` · `sales-document-form.component.ts:292-298`)_

**3.3 · L'avviso di conflitto propone il «primo libero» senza la data, in tre servizi.**
Il numero suggerito si calcola su una partizione filtrata per data: dove la data non
arriva, l'avviso propone il primo libero **a oggi**, cioè con una regola diversa da
quella che ha appena assegnato il numero. Restano tre punti, e in tutti e tre la data non
è nemmeno in scope — servirebbe farla arrivare al metodo:
`documents.service.ts:1039`, `manual-sales-orders.service.ts:523`,
`supplier-orders.service.ts:530`.

---

## Cosa è già cambiato il 13/08

Sette divergenze di questo elenco sono state chiuse lo stesso giorno, perché erano
difetti e non scelte. Il dettaglio sta in `04-specifica-numerazione-documenti.md` §9.

| Era                                                                                                   | Ora                                                               |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Sei maschere su sette non rifacevano l'anteprima al cambio data — e l'endpoint non accettava una data | Tutte e sette la rifanno; la data viaggia sul DTO dei contatori   |
| L'Ordine cliente chiedeva contatori e cronologia sul tipo `quote`                                     | Ha un `numberingDocumentType` suo, `customer_order`               |
| Numero già preso → **500**                                                                            | **409** con numero rifiutato e primo libero                       |
| Cronologia → **500** sull'Ordine cliente                                                              | Legge `order_number`, che è come si chiama lì il riferimento      |
| Cronologia cieca sui documenti **senza serie**                                                        | `serieCanonica`: vuoto, spazi e assente sono la stessa partizione |
| Registrazione fattura e Trasferimento/Rettifica numeravano «a oggi»                                   | Inoltrano la data del documento                                   |
| L'avviso di conflitto del Trasferimento ignorava la data (`_documentDate`)                            | La usa                                                            |

---

## Come è stata costruita, e cosa non copre

Ventidue letture indipendenti: dodici hanno compilato una riga ciascuna leggendo
componente, template, test e servizi API; le altre hanno **tentato di smentire** ogni
divergenza trovata, cercandone la ragione in tre posti nell'ordine — commento nel codice,
test che la fissa, riga di specifica. Tutte e quattordici sono state confermate reali.

Cosa **non** copre, e va detto:

- **È una lettura del codice, non una prova.** Dove qualcosa è stato verificato
  eseguendo l'applicazione, è detto nel §9 della specifica numerazione.
- **Non guarda la vista mobile** se non dove il comportamento cambia.
- **Non copre Vendita al banco e Reso**, che numerano da `store-sales.service.ts` con
  regole proprie (§5 e §8 della specifica).
