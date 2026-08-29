# 17 · Ordine fornitore — specifica normativa di modulo

**Versione:** 1.0 candidata
**Data:** 28/08/2026
**Stato:** candidata da approvare prima dell'implementazione
**Modulo:** Ordine fornitore
**Natura:** specifica funzionale di dominio. Non è un audit, non è un ordine di modifica del codice.

Questa specifica dichiara **cosa deve fare** l'Ordine fornitore. Dove il codice
corrente diverge, la divergenza è marcata **STATO TECNICO** con la misura che la
dimostra: il codice descrive ciò che esiste, non decide ciò che è corretto.

⛔ **La matrice delle coppie origine → destinazione NON sta qui.** Vive in
`12-specifica-collegamenti-documentali.md`, ed è l'unica. Questa specifica
dichiara gli **stati** dell'Ordine fornitore e quali di essi sono eleggibili;
quale destinazione li consumi lo dice la `12`.

---

## 1. Che cos'è, e cosa non tocca

L'Ordine fornitore registra un impegno d'acquisto verso un fornitore.

⭐ **Non tocca il magazzino. In nessun modo.** È la differenza che separa questo
modulo dall'Ordine cliente, e da essa discende quasi tutto il resto:

```text
Giacenza      non la modifica
Impegnata     non la crea, non la consuma, non la rilascia
In arrivo     non la alimenta
Movimenti     non ne produce
```

**STATO TECNICO — misurato il 28/08/2026:** `api/src/supplier-orders/` non contiene
un solo riferimento a `StockReservation`, e la riga ordine fornitore non ha una
spunta magazzino. La grandezza «In arrivo» **esiste** — `inventoryLevel.incoming`
con la funzione `applyIncomingDelta` in `api/src/inventory/inventory-incoming.util.ts`
— ma **nessuno la chiama**: l'unico import è il suo stesso spec.

A muovere la merce è l'**Arrivo merce**, che è un documento a sé.

### 1.1 «In arrivo» — FUORI PERIMETRO v1, ma è già costruita quasi tutta

Danea alimenta le quantità in arrivo dall'ordine fornitore. VestiFlow **non lo fa
e non lo farà in questa versione**.

⚠️ La nota non è un promemoria generico: serve a impedire che chi un giorno vorrà
quella funzione ne costruisca una **seconda**. Misurato il 28/08/2026, la filiera
esiste in sette punti su otto — manca solo chi la riempie.

| Dove                                                                                   | Che cosa                                                                             | Stato                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:878`                                                             | colonna `inventoryLevel.incoming`, `Int @default(0)`                                 | ✅ esiste, dal `0001_init`                                                                    |
| `api/src/inventory/inventory-incoming.util.ts:8`                                       | `applyIncomingDelta(tx, tenant, variant, location, delta)`                           | ✅ upsert, incremento, decremento con guardia e `UnprocessableEntityException` sul sotto-zero |
| `…/inventory-incoming.util.spec.ts`                                                    | 2 prove                                                                              | ✅ verdi                                                                                      |
| `core/models/inventory-level.model.ts:25`                                              | campo del modello client, commentato «In arrivo (ordini fornitore / trasferimenti…)» | ✅ esiste                                                                                     |
| `features/inventory/models/inventory-levels-table-columns.config.ts:15`                | colonna «In arrivo» delle Giacenze                                                   | ✅ dichiarata, `defaultVisible: false`                                                        |
| `features/inventory/models/inventory-situation-table-columns.config.ts:22`             | colonna «In arrivo» della Situazione                                                 | ✅ dichiarata, `defaultVisible: false`                                                        |
| `api/src/inventory/inventory-export.service.ts:64` · `import/inventory-csv.util.ts:10` | «In arrivo» in export e import CSV                                                   | ✅ esistono                                                                                   |
| **chi chiama `applyIncomingDelta`**                                                    | —                                                                                    | ⛔ **nessuno**: l'unico import è il suo stesso spec                                           |

⛔ **Conseguenza osservabile oggi:** un operatore che accende la colonna «In
arrivo» dal selettore Colonne vede **sempre zero**, su ogni articolo e ogni sede.
La colonna non è rotta: non è collegata.

⚠️ **Chi implementerà la funzione deve partire da qui**, non da un modello nuovo.
E il punto di aggancio è una decisione funzionale non ancora presa: se «In arrivo»
si alimenti alla **conferma** dell'ordine o al suo **invio** al fornitore, e se si
scarichi all'Arrivo merce o all'annullamento dell'ordine.

---

## 2. Gli stati

### 2.1 I quattro stati

| Stato             | Origine                                        | Eleggibile in Includi/Genera |
| ----------------- | ---------------------------------------------- | ---------------------------- |
| **Da confermare** | scelto dall'operatore                          | ⛔ no                        |
| **Confermato**    | scelto dall'operatore · default alla creazione | ✅ sì                        |
| **Concluso**      | **derivato** dal collegamento                  | ⛔ no                        |
| **Annullato**     | atto esplicito dell'operatore                  | ⛔ no                        |

### 2.2 ⛔ Gli stati governano SOLO l'eleggibilità

> **Lo stato dell'Ordine fornitore decide una cosa sola: se l'ordine può essere
> incluso in un Arrivo merce. Nient'altro.**

Non governa — e questo è normativo, non descrittivo:

```text
routing                l'ordine si apre dal clic di riga in ogni stato
apertura della Modifica ⟶ sempre
Salva                  ⟶ sempre, secondo permessi
Elimina                ⟶ secondo permessi, mai secondo lo stato
lucchetto              ⟶ regola comune del documento, non dello stato
permessi               ⟶ matrice permessi, non stato
stampa                 ⟶ sempre
```

⭐ **APPLICATO il 28/08/2026.** Qui c'era il blocco «STATO TECNICO — due divergenze
misurate», che elencava due guardie in `supplier-orders.service.ts` e concludeva
_«oggi un ordine Concluso non si modifica e un ordine Confermato non si elimina»_.
**Le due guardie non ci sono più**, per decisione del proprietario: la gestione del
documento non dipende dallo stato, e il codice ora lo rispetta.

⚠️ **Andavano tolte insieme**, e vale la pena saperlo: si componevano in un vicolo
cieco. Da Concluso non si usciva (`cancel` voleva `confirmed`) e senza passare da
Annullato non si eliminava (`delete` voleva `cancelled`) — quattro passi per
un'operazione che ne vale uno. Toglierne una sola avrebbe lasciato il vicolo.

⚠️ La conseguenza che questa sezione annunciava — _«modificare le righe dopo la
ricezione le fa divergere dal documento che le ha ricevute»_ — è stata affrontata il
**29/08/2026** e non con un blocco di stato: le righe conservano la loro identità al
salvataggio, quindi il Ricevuto non si perde più. Vedi §5.3.

### 2.3 «Da confermare»

Un Ordine fornitore salvato che **non è ancora un impegno d'acquisto**.

⚠️ **Qui non ha una giustificazione di magazzino**, al contrario dell'Ordine
cliente dove «Da confermare» serve a non impegnare la merce. L'Ordine fornitore
non impegna niente in nessuno stato: «Da confermare» serve a **tenerlo fuori
dall'elenco Includi dell'Arrivo merce** finché non è confermato.

⭐ **NON è il default, e la decisione è chiusa il 28/08/2026** (vedi OF-001): un ordine
nuovo nasce **Confermato**, come oggi. «Da confermare» è una scelta esplicita
dell'operatore — chi crea normalmente un ordine non deve fare un passaggio in più
solo perché è stato introdotto un quarto stato.

**STATO TECNICO:** il valore si aggiunge all'enum esistente in modo **additivo**
(`ALTER TYPE "SupplierOrderStatus" ADD VALUE 'to_confirm'`), e il default di
creazione resta `confirmed` (`supplier-orders.service.ts:228`). Nessun ordine
esistente cambia stato, e nessun backfill è necessario su questo lato.

**STATO TECNICO:** non esiste. L'enum ha tre valori:

```prisma
enum SupplierOrderStatus { confirmed · concluded · cancelled }
```

⭐ **Introdurlo qui costa molto meno che sull'Ordine cliente**: là gli stati sono
derivati da due timestamp e non c'è dove metterlo; qui c'è una **colonna enum
vera**, e si aggiunge un valore. Resta comunque una migration, che appartiene a
un intervento dedicato.

⛔ **E la migration deve tenere i due assi SEPARATI.** «Da confermare» è lo stato
**commerciale** dell’ordine, non uno stato di persistenza: un ordine Da confermare è già
salvato e già numerato. Se per rappresentarlo si finisse per riportare il documento in bozza,
si sarebbe reintrodotta la Bozza sotto un altro nome — dopo averla abolita. È il criterio con
cui giudicare la proposta tecnica, prima ancora di guardare se funziona (indice `00`).

### 2.4 «Confermato»

Lo stato operativo, e il default alla creazione — **STATO TECNICO: già così**
(`supplier-orders.service.ts:207`, `status: SupplierOrderStatus.confirmed`).

È l'unico stato eleggibile come sorgente.

### 2.5 ⭐ «Concluso» è derivato, non scelto

> **Concluso non si assegna: si calcola.** È il nome che l'ordine assume quando
> ha almeno un Arrivo merce **attivo** collegato.

**STATO TECNICO — già implementato così**, `document-supplier-order.util.ts:56`:

```ts
const nextStatus =
  activeLinkedDocuments > 0 ? SupplierOrderStatus.concluded : SupplierOrderStatus.confirmed;
```

Conta i documenti collegati **non annullati** e ricalcola.

⚠️ **COMPORTAMENTO MISURATO, non norma** — precisato il 28/08/2026. Con quel ricalcolo,
annullato l’Arrivo merce l’ordine **oggi** torna Confermato da solo. ⛔ **Non è però una regola
approvata**, e non va letta come «togliere il link sblocca il Concluso»: la norma è più stretta
— Concluso resta bloccato e non si cambia a mano, e l’effetto di una futura operazione
**esplicita** di scollegamento o riapertura è disciplinato dalla policy di `12`, che non è
ancora scritta. Qui c’era «il ritorno è automatico» presentato come proprietà da non perdere:
un comportamento osservato non diventa norma perché esiste.

Resta invece una proprietà vera del ricalcolo:

- ⭐ **è idempotente per costruzione**: scrive solo se `nextStatus !== order.status`.

⚠️ **Differenza sostanziale con l'Ordine cliente**, e va tenuta a mente leggendo
le due specifiche insieme: là Concluso è un **timestamp** che, scritto, resta — e
il ritorno a Confermato è nel backlog. Qui è una **funzione del collegamento**, e
il ritorno esiste già.

⛔ **Nessuno deve poter impostare Concluso a mano.** Un valore scelto verrebbe
sovrascritto al primo ricalcolo, e nel frattempo mentirebbe.

**STATO TECNICO:** non c'è rischio oggi — la maschera Ordine fornitore **non ha
un selettore di Stato**, né controllo né campo. L'unico atto manuale è «Annulla
ordine», comando del Dettaglio.

#### ⭐ E finché è Concluso, lo STATO si blocca — deciso dal proprietario il 28/08/2026

> **Un ordine agganciato a un altro documento non cambia stato a mano. Nessuna
> transizione manuale parte da Concluso — né a Confermato, né a Da confermare, né
> ad Annullato.**

⛔ **Il blocco è sullo STATO, non sul documento.** L'ordine Concluso si apre, si
modifica riga per riga, si salva, si stampa e si elimina secondo i permessi
comuni — §5 vale integralmente. Ciò che non si può fare è **dichiararlo
diversamente da com'è**: lo stato descrive un collegamento che esiste, e finché
quel collegamento esiste la descrizione non è opinabile.

**Il criterio è che Concluso è già derivato.** Non è una restrizione nuova: è la
conseguenza di §2.5. Un valore impostato a mano verrebbe sovrascritto al primo
ricalcolo, quindi «permetterlo» significherebbe permettere un comando che non
comanda — e nel frattempo l'ordine mostrerebbe uno stato falso.

**L'uscita esiste, e non è manuale**: si annulla o si elimina l'Arrivo merce
collegato. L'ordine torna Confermato **da sé** e ridiventa includibile. È la
stessa strada di §2.5, ed è l'unica.

⭐ **Non serve un comando di sblocco, e non va inventato.** Uno «scollega» che
tolga il legame lasciando in piedi l'Arrivo merce produrrebbe un documento di
carico senza ordine d'origine — cioè esattamente il dato incoerente che il
ricalcolo automatico evita.

**STATO TECNICO — conforme per costruzione, con un solo punto da correggere:**

| Via                            | Oggi                                                                                      | Conforme?                         |
| ------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------- |
| selettore di Stato in maschera | **non esiste** (§2.5)                                                                     | ✅ nulla da bloccare              |
| ricalcolo automatico           | scrive `confirmed`/`concluded` in funzione del legame                                     | ✅ è la fonte, non una violazione |
| impostare lo stato Annullato   | non è una scelta: è il comando `@Post(':id/cancel')`, a senso unico e solo da `confirmed` | ⛔ vedi §2.6                      |

⚠️ **La condizione non è il vero pezzo mancante.** Qui c’era scritto che bastava riscrivere
`status === confirmed` in `status !== concluded`: vero per quella condizione, ma insufficiente.
Ciò che manca è che **le transizioni di stato non hanno una porta** — esiste un `cancel` e
nient’altro. Vedi §2.6, «l’implementazione è un altro modello».

#### ⭐ La riapertura: policy decisa il 28/08/2026 — la norma è in `12` §0.4-bis

⚠️ **Qui il ricalcolo era registrato come «comportamento misurato, non norma».** Ora è norma, e
il comportamento corrente **è già conforme**: non c’è niente da cambiare su questo lato.

> **Annullare o eliminare un Arrivo merce collegato è un’operazione documentale che RICALCOLA lo
> stato dell’ordine.** Non è l’assenza del legame a riaprirlo.

| dopo l’operazione                                 | stato          |
| ------------------------------------------------- | -------------- |
| resta almeno un Arrivo merce `status ≠ cancelled` | **Concluso**   |
| non ne resta nessuno attivo                       | **Confermato** |

⭐ **Il collegamento a un documento annullato è NORMALE qui**, al contrario dell’Ordine cliente:
`cancel()` **non** azzera `Document.supplierOrderId`, ed è `status = cancelled` a rendere il
legame non conclusivo. Per questo l’eleggibilità si scrive:

```text
status = confirmed  AND  documents.none(status ≠ cancelled)
```

⛔ **E nessuno di questi cambi di stato produce effetti quantitativi**: non tocca Giacenza,
non crea Impegnata né reservation, non genera movimenti, non mantiene un «In arrivo». Lo stato
serve al ciclo commerciale e all’eleggibilità, e a nient’altro (§2.2, §1.1).

### 2.6 «Annullato»

L'ordine non si farà. Resta nello storico: **annullato non è eliminato**.

- non è eleggibile come sorgente;
- non produce effetti di magazzino, perché il modulo non ne produce mai;
- l'ordine resta apribile, modificabile e stampabile.

#### ⭐ È uno STATO, non un comando — e si torna indietro _(deciso dal proprietario il 28/08/2026)_

> **«Annullato» è un valore dello stato come gli altri: si sceglie dal selettore, e si può
> togliere. Non esiste un comando «Annulla ordine», e non esiste un punto di non ritorno.**

⛔ **Qui c'era «da deliberare», ed era la domanda sbagliata.** Chiedeva se «Annulla ordine»
fosse reversibile, dando per buono che fosse un comando. Non lo è: l'ordine ha uno stato, e
Annullato è uno dei suoi valori.

⭐ **La differenza non è terminologica.** Un comando è un atto che produce un effetto e
tipicamente non si disfa; uno stato è una descrizione che si corregge. Chi sbaglia riga
nell'elenco e annulla l'ordine di ieri deve poter rimettere il valore giusto — non aprire
un ticket.

| Da            | Ad Annullato | Da Annullato a  |
| ------------- | ------------ | --------------- |
| Da confermare | ✅           | ✅ si torna     |
| Confermato    | ✅           | ✅ si torna     |
| **Concluso**  | ⛔ no        | — non ci arriva |

⭐ **Il blocco del Concluso resta intatto** (§2.5), e ora si legge meglio: **tre stati liberi
più uno derivato**. Da confermare, Confermato e Annullato si scelgono e si cambiano in
qualsiasi ordine; Concluso non si sceglie mai, e finché dura il legame nessuno degli altri
tre è raggiungibile.

⚠️ **Qui il ritorno è gratuito, e conviene sapere perché.** L'Ordine fornitore non tocca
nessuna grandezza di magazzino in nessuno stato: riportarlo da Annullato a Confermato non
deve ricostruire niente. **Sull'Ordine cliente non è così** — là il ritorno deve ricreare le
`reservation`, ed è materia di `18` §6.4.

#### ⛔ STATO TECNICO — l'implementazione è un altro modello

Non è una divergenza di dettaglio: oggi il codice non ha uno stato modificabile, ha un
**comando a senso unico**.

```text
@Post(':id/cancel')                         supplier-orders.controller.ts:154
  → supplier-orders.service.ts:362
  → if (status !== confirmed) ConflictException
  → data: { status: cancelled }
```

Tre scarti in un punto solo:

|                                                         |                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| è un **comando**, non un valore che l'operatore imposta | serve un selettore di Stato, che oggi non esiste affatto           |
| è a **senso unico**                                     | non c'è nessun endpoint che riporti un ordine fuori da `cancelled` |
| parte **solo da `confirmed`**                           | il futuro «Da confermare» non sarebbe annullabile                  |

⚠️ **Cade quindi la nota «la guardia è giusta per caso».** Diceva che bastava riscrivere
`status === confirmed` in `status !== concluded`. Vero per la sola condizione, ma insufficiente:
il pezzo mancante non è la condizione — è che **le transizioni di stato non hanno una porta**.
Esistono un `cancel` e nient'altro.

### 2.7 Nessuno stato parziale

⛔ **Non esiste «Parzialmente concluso» per l'Ordine fornitore**, e non va
introdotto — nemmeno se un Arrivo merce copre solo parte delle quantità ordinate.

È la stessa decisione presa per l'Ordine cliente, e per la stessa ragione: un
avanzamento parziale è un dominio intero — residui, percentuali, riapertura — che
la v1 non gestisce.

**STATO TECNICO:** oggi non esiste. `SupplierOrderStatus` ha tre valori e nessuno
è parziale. Non c'è nulla da rimuovere; c'è da non aggiungerlo.

---

## 3. Macchina degli stati

⭐ **Tre stati liberi più uno derivato.** Da confermare, Confermato e Annullato si scelgono
dal selettore e si cambiano in qualsiasi ordine, in entrambe le direzioni. Concluso non si
sceglie mai e, finché dura il legame, blocca tutto il resto.

| Da            | A             | Ammessa       | Come                                                      |
| ------------- | ------------- | ------------- | --------------------------------------------------------- |
| Da confermare | Confermato    | ✅            | scelta dell’operatore, al salvataggio                     |
| Da confermare | Annullato     | ✅            | scelta dell’operatore                                     |
| Confermato    | Da confermare | ✅            | scelta dell’operatore                                     |
| Confermato    | Annullato     | ✅            | scelta dell’operatore                                     |
| **Annullato** | Confermato    | ✅            | **scelta dell’operatore: Annullato è reversibile** (§2.6) |
| **Annullato** | Da confermare | ✅            | idem                                                      |
| Confermato    | **Concluso**  | ✅            | **solo** collegando un Arrivo merce attivo                |
| **Concluso**  | Confermato    | ✅            | **solo** annullando o eliminando l’Arrivo merce collegato |
| **Concluso**  | Da confermare | ⛔ **mai**    | lo stato è bloccato finché il legame esiste (§2.5)        |
| **Concluso**  | Annullato     | ⛔ **mai**    | si toglie prima il legame, poi si annulla (§2.6)          |
| _qualunque_   | Concluso      | ⛔ mai a mano | è derivato (§2.5)                                         |

⭐ **Dal Concluso esce una sola freccia, e non la tira l’operatore.** È la differenza fra uno
stato scelto e uno stato derivato: le altre transizioni partono da un comando, questa parte da
un fatto — il legame che smette di esistere.

⚠️ **Gli effetti scattano al salvataggio, mai alla selezione.** Cambiare il valore
in maschera non deve produrre nulla prima di un Salva riuscito — e sul collegamento,
nulla prima che l'Arrivo merce sia **realmente salvato**.

⛔ **Aprire un Arrivo merce precompilato non conclude l'ordine.** Se l'operatore
chiude senza salvare, l'ordine resta nello stato di prima e nessuna relazione
esiste.

---

## 4. Eleggibilità in Includi / Genera

L'Ordine fornitore partecipa al motore comune. **Non ha un motore proprio.**

```text
Da confermare  ⛔
Confermato     ✅   se la coppia è ammessa dalla 12
Concluso       ⛔   ha già un Arrivo merce attivo
Annullato      ⛔
```

La regola vale a **tutti** i livelli, non solo nel pannello:

- la UI non propone gli ordini non eleggibili;
- l'**API rifiuta** una richiesta diretta che li nomini;
- il rifiuto vive nella transazione, non solo nella query dell'elenco.

**STATO TECNICO — già implementato**, `goods-receipt-workflow.service.ts:539`:

```ts
if (linkedOrder.status !== SupplierOrderStatus.confirmed) {
  throw new ConflictException(…)
}
```

⭐ La guardia c'è ed è **lato server**, dove conta. Introdurre «Da confermare»
non richiede di riscriverla: il predicato è già «solo `confirmed`».

---

## 5. Il documento resta libero

> **Lo stato non è un permesso.** Un Ordine fornitore si apre, si legge, si
> modifica, si salva, si stampa e si elimina secondo permessi e regole comuni del
> documento, in **qualunque** stato.

### 5.1 Routing

```text
clic sulla riga dell'elenco  →  Modifica
Dettaglio                    →  azione separata
```

Vale per tutti e quattro gli stati. **STATO TECNICO: già conforme** — il routing
comune non riceve più lo stato (la firma di `documentRowPath` non lo accetta), e
la maschera carica `confirmed`, `concluded` e `cancelled`.

### ⭐ Il campo Stato esiste in maschera — 29/08/2026

> **Prima di oggi l'Ordine fornitore non mostrava affatto il proprio stato**: era
> filtrabile nell'elenco e invisibile nel documento. Con quattro stati, «Da confermare»
> sarebbe stato irraggiungibile.

In testata, dopo «Consegna prevista», con lo **stesso** selettore dell'Ordine cliente —
`app-document-header-field` + `app-select-menu`, le tre voci da `ORDER_STATE_OPTIONS`.

```text
Da confermare · Confermato · Annullato        scegliibili
Concluso                                      mostrato quando è lo stato corrente,
                                              in sola lettura, mai selezionabile
```

⛔ **Su un ordine Concluso lo stato NON viaggia nel payload.** Il campo è bloccato,
quindi il controllo porta un valore che l'operatore non ha scelto: mandarlo farebbe
rifiutare il salvataggio dalla macchina comune, e l'ordine non sarebbe più modificabile
in nulla — l'opposto di §5.3.

⚠️ **Nessun effetto quantitativo introdotto**: nessuna colonna «Impegnata», nessuna «In
arrivo». Giacenza e impegni restano dell'Arrivo merce (§1.1, OF-002), e il flusso
Ordine → Arrivo merce è invariato — Ricevuto/residuo, collegamenti di riga e Arrivo
merce come snapshot autonomo.

⏸ **Verifica visiva in un browser: pendente**, registrata in `docs/DA-FARE.md`. Non
blocca la chiusura funzionale.

### 5.2 Lucchetto

Un ordine riaperto nasce **protetto** e si sblocca con un gesto esplicito.

⭐ **Il lucchetto non guarda lo stato** — `formReadOnly = isEditMode() && loadState() === 'ready' && !editLock.unlocked()`
— ed è la forma giusta: protegge dal salvataggio distratto, non dallo stato.

### 5.3 Modifica ed eliminazione

> **Lo stato non governa né la modifica né l'eliminazione: valgono i permessi
> comuni.** L'unica eccezione è il campo **Stato** di un ordine Concluso, che è
> derivato e quindi bloccato (§2.5).

⭐ Le due guardie di stato che stavano qui (`update` da `confirmed`, `delete` da
`cancelled`) sono state **rimosse il 28/08/2026**: vedi §2.2, che ne conserva la
ragione.

#### ⭐ Eliminare un Concluso è AMMESSO, e l'Arrivo merce resta orfano — deciso il 28/08/2026

> **L'eliminazione di un Ordine fornitore Concluso è consentita secondo i permessi
> comuni. L'Arrivo merce collegato SOPRAVVIVE e perde il riferimento all'ordine.**

⚠️ **Non è la stessa cosa dell'annullamento, e la differenza è deliberata.**
Annullare cambia lo **stato** — derivato, quindi bloccato (§2.5). Eliminare
rimuove il **documento**, e §5 dice che il documento resta libero.

| Azione su un ordine Concluso |                              | Effetto sull'Arrivo merce     |
| ---------------------------- | ---------------------------- | ----------------------------- |
| impostare Annullato          | ⛔ vietato                   | —                             |
| «Elimina»                    | ✅ ammesso, secondo permessi | **sopravvive**, senza origine |

⭐ **Lo schema lo implementa già, ed è la forma giusta.** Non serve una migration:

```prisma
Document.supplierOrder          @relation(… onDelete: SetNull)   // riga 2261
DocumentLine.supplierOrderLine  @relation(… onDelete: SetNull)   // riga 2391
SupplierOrderLine.order         @relation(… onDelete: Cascade)   // riga 1219
```

L'ordine porta via **solo le proprie righe**. Il carico resta in magazzino con le
sue quantità, e `supplierOrderId` diventa `NULL`. ⛔ Un `Cascade` sul documento
avrebbe cancellato un Arrivo merce già registrato — cioè avrebbe fatto sparire
merce entrata davvero.

⭐ **La strada diretta è aperta dal 28/08/2026.** Qui c'era un blocco «STATO TECNICO»
che descriveva l'ordine Concluso come impossibile da annullare e da eliminare, e la
strada dei quattro passi per arrivarci. Non è più così: le due guardie sono state
rimosse, e la ragione per cui andavano tolte **insieme** sta in §2.2.

⭐ **Il messaggio d'errore di `cancel` diceva già la dottrina di §2.5** — _«Un ordine
concluso resta collegato al suo arrivo merce»_ — e la guardia era giusta nel merito,
sbagliata nella forma. Ora il rifiuto arriva dalla macchina comune
(`assertManualTransition`), che è l'unico posto dove sta scritto.

#### ⭐ Le righe conservano la loro IDENTITÀ al salvataggio — corretto il 29/08/2026

> **Salvare un Ordine fornitore non ricrea le sue righe: aggiorna quelle che
> restano, crea quelle nuove, elimina quelle davvero tolte.**

⛔ **Qui il salvataggio era `deleteMany` + ricrea tutto**, e la conseguenza si
misurava su un ordine già concluso — **a ogni salvataggio, anche senza modifiche**:

```text
PRIMA   riga df0c0691…   ordinato 10   ricevuto 8   legami dell'Arrivo merce 1
        ↓  PATCH con le RIGHE IDENTICHE, nessun campo cambiato
DOPO    riga 5c740c94…   ordinato 10   ricevuto 0   legami dell'Arrivo merce 0
```

Le righe rinascevano con id nuovi, quindi cadeva **il Ricevuto** (`receivedQuantity`
tornava al suo `@default(0)`: il servizio non la scriveva affatto) e **il legame**
`DocumentLine.supplierOrderLineId`, per via del suo `onDelete: SetNull`.

⚠️ **Bastava riaprire l'ordine e premere Salva** — anche solo per correggere la
data — e la colonna Ricevuto mostrava 0 su merce arrivata davvero.

⭐ **Non è una causa nuova: è la stessa di `docs/09` §3**, dove le righe documento
staccavano i movimenti via `sourceLineId`. Ordine cliente, Arrivo merce e Vendita al
banco erano già stati corretti; l'Ordine fornitore era l'ultimo rimasto, e il codice
lo dichiarava — _«il salvataggio è deleteMany + create, le righe perdono l'id […]
Temporaneo (24/08/2026)»_.

**Il contratto, deterministico e nell'ordine:**

| Cosa arriva dal client      | Cosa fa il server               |
| --------------------------- | ------------------------------- |
| riga con `id` noto          | **update**, stesso id           |
| riga senza `id`             | **create**, id nuovo            |
| riga non più inviata        | **delete** della sola sparita   |
| `id` sconosciuto o ripetuto | **422**, mai una creazione muta |

**Le quattro conseguenze funzionali**, decise dal proprietario il 29/08/2026:

- **sostituire l'articolo sulla stessa riga NON la sostituisce**: l'id resta, e i
  valori che il client non modifica restano quelli del documento;
- **eliminare una riga la fa finire davvero**, in ogni stato — nessun blocco, nessun
  soft-delete, nessuna tombstone;
- **un articolo aggiunto dopo è una riga nuova**, che non eredita niente da quella
  eliminata: nasce con Ricevuto a zero;
- **l'Arrivo merce già salvato resta autonomo**: tiene le sue righe, le sue quantità
  e i suoi movimenti. Se la riga d'ordine viene eliminata perde solo il puntatore —
  è il `SetNull` dello schema, non una riscrittura del documento.

⛔ **La funzione condivisa `persistDocumentLinesByIdTx` non era riusabile così com'è**:
scrive su `tx.documentLine`, e questa è un'altra tabella. Si è riusato l'**algoritmo**,
nella forma che l'Ordine cliente ha già su `salesOrderLine` per lo stesso motivo.

⚠️ **Serviva anche il client**: il DTO di riga non aveva `id`, quindi l'identità non
era nemmeno esprimibile. La maschera l'id ce l'aveva già in `form` e lo leggeva dal
server — semplicemente non lo rimandava.

---

---

## 6. Ciò che questa specifica NON decide

Appartiene ad altri documenti, e ripeterlo qui creerebbe una seconda fonte:

| Materia                                      | Fonte               |
| -------------------------------------------- | ------------------- |
| quali coppie origine → destinazione esistono | `12`                |
| cosa consuma un ordine e quando              | `12`                |
| numerazione e serie                          | `04`                |
| righe documento, celle, colonne              | `03`                |
| elenco, filtri, colonne, riepilogo           | `14`                |
| denaro, netto/ivato, arrotondamenti          | `regole-gestionale` |
| permessi                                     | matrice permessi    |

---

## 7. FUORI PERIMETRO v1

- alimentazione della quantità «In arrivo» (§1.1);
- evasione parziale, residui, percentuali di avanzamento;
- stato «Parzialmente concluso»;
- più Arrivi merce che completano progressivamente lo stesso ordine, con
  avanzamento tracciato;
- riordino automatico dei sottoscorta;
- motore Includi/Genera locale al modulo.

---

## 8. Criteri di accettazione

### OF-001 · Il default alla creazione

Nuovo Ordine fornitore → stato **Confermato**, nessun effetto prima del Salva.

### OF-002 · Nessun effetto di magazzino

Salvare un Ordine fornitore in qualunque stato, con righe di articoli gestiti a
magazzino. Atteso: **zero** movimenti, Giacenza invariata, Impegnata invariata,
«In arrivo» invariata.

### OF-003 · Eleggibilità

```text
Da confermare · Concluso · Annullato  →  non compaiono nell'Includi dell'Arrivo merce
Confermato                            →  compare
```

Provato **anche via API diretta**, non solo dal pannello: la richiesta che nomina
un ordine non eleggibile deve essere rifiutata e non deve creare nulla.

### OF-004 · Concluso è derivato

Collegare un Arrivo merce e salvarlo → l'ordine diventa **Concluso**, senza che
nessuno lo scelga.

### OF-005 · Il ricalcolo, e ciò che NON prova

Annullato l’Arrivo merce collegato, il ricalcolo riporta l’ordine a **Confermato**: è il
comportamento da verificare, ed è quello che il codice fa oggi.

⛔ **Questo criterio non stabilisce una policy di riapertura**, e non va usato per dedurne una.
Che togliere il link debba sbloccare il Concluso è materia di `12` e non è deciso.

### OF-006 · Idempotenza del ricalcolo

Salvare due volte lo stesso Arrivo merce, o ritentare dopo un timeout: **un solo**
collegamento, un solo cambio di stato, nessun effetto doppio.

### OF-007 · Prefill senza salvataggio

Aprire l'Arrivo merce precompilato e chiudere senza salvare → l'ordine resta nello
stato precedente, nessuna relazione, nessun movimento.

### OF-008 · Lo stato non governa il routing

Aprire dall'elenco un ordine in ciascuno dei quattro stati → **tutti** aprono la
Modifica.

### OF-009 · Lo stato non governa la Modifica

Un ordine **Concluso** si apre, si sblocca, si modifica e si salva secondo i
permessi ordinari. ⛔ Oggi fallisce: `update` rifiuta (§2.2).

### OF-010 · Lo stato non governa l'Elimina

Un ordine **Confermato** senza collegamenti si elimina secondo i permessi
ordinari. ⛔ Oggi fallisce: `delete` accetta solo gli annullati (§2.2).

### OF-011 · Annullato resta consultabile

Un ordine Annullato si apre, si legge e si stampa. Non compare fra le sorgenti.

### OF-012 · Nessuno stato parziale

Un Arrivo merce che copre parte delle quantità → l'ordine è **Concluso**, non
«parzialmente» qualcosa, e non nasce un residuo evadibile.

### OF-013 · Tenant e sede

Ogni operazione rispetta tenant e scope sede, verificati **lato API**.

### OF-014 · Concluso non si cambia a mano

Con un Arrivo merce attivo collegato, nessuna azione dell’operatore porta
l’ordine fuori da Concluso: impostare Annullato è **rifiutato dall’API**, e nessun
selettore di Stato lo consente.

### OF-015 · E l’uscita passa dal legame

Annullato l’Arrivo merce collegato, l’ordine torna **Confermato senza alcun
comando** e da lì è annullabile. Nessun «scollega» esiste.

### OF-016 · Ma il documento resta gestibile

Un ordine Concluso si apre in Modifica dal clic di riga, si modifica, si salva,
si stampa. Il blocco riguarda **solo** il valore dello stato.

### OF-017 · Eliminare un Concluso non cancella il carico

Eliminato un Ordine fornitore Concluso, l’Arrivo merce collegato **esiste
ancora**, con le sue righe e le sue quantità, e il suo riferimento all’ordine è
`NULL`. Le giacenze non si muovono di un pezzo.

---

## 9. Test minimi richiesti

**Unitari** — la funzione che deriva Concluso: conta i documenti attivi, ignora
gli annullati, non scrive se lo stato non cambia · l'eleggibilità per stato ·
l'idempotenza del ricalcolo.

**API** — il rifiuto dell'Includi su ordine non eleggibile, con la richiesta
diretta · update ed elimina che **non** guardano lo stato (§2.2), quando corretti
· tenant e sede.

⭐ **E il rifiuto dell’annullamento su Concluso va falsificato**, non solo
verificato: un test che passa perché l’ordine era in un altro stato non prova
niente. Serve la coppia — annullamento rifiutato con il legame attivo, e
accettato dopo averlo tolto.

**Componente** — il routing per i quattro stati · il lucchetto che non guarda lo
stato · l'assenza di un selettore di Stato che possa impostare Concluso.

**Regressione** — Arrivo merce · la numerazione · l'elenco e i suoi filtri ·
l'export.

⚠️ Build verde e lint pulito non dimostrano nessuno di questi punti.

---

## 10. Sintesi vincolante

```text
ORDINE FORNITORE

STATI          Da confermare · Confermato · Concluso · Annullato

CONCLUSO       derivato dal collegamento, mai scelto
               si disfa da sé quando l'Arrivo merce viene annullato
               finché dura il legame lo STATO è bloccato: nessuna
               transizione manuale, annullamento compreso
               ma il DOCUMENTO si elimina: l’Arrivo merce sopravvive
               orfano (SetNull), le giacenze restano intatte

ELEGGIBILE     solo Confermato

LO STATO       governa SOLO l'eleggibilità in Includi/Genera
               non governa routing · Modifica · Salva · Elimina
               · lucchetto · permessi · stampa

MAGAZZINO      nessun effetto, in nessuno stato
               Giacenza · Impegnata · In arrivo · Movimenti  →  intatti

NESSUN         stato parziale · residuo · avanzamento

MATRICE        vive nella 12, non qui
```
