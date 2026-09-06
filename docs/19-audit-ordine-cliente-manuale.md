> ## ⛔ DOCUMENTO CONGELATO — 28/08/2026
>
> **Questa è una misura, non un piano.** Fotografa il codice a una data e non si aggiorna mano
> a mano che i difetti si correggono: serve a stabilire **da dove si parte**, e perde quel
> valore se lo si riscrive.
>
> ⭐ **Un solo aggiornamento è stato fatto dopo la consegna, ed è dichiarato**: la rimisura
> delle **sei righe** toccate dalla correzione del motore `StockReservation` sul cambio
> variante — righe 106, 110, 113, 118, 119 (D3) e 199 (D7). Erano state misurate su un albero
> che si stava muovendo, e citavano numeri di riga che non esistono più.
>
> ⛔ **Da qui in avanti non si modifica.** Quando i difetti verranno corretti, l'esito si
> registra **altrove** — nel documento del lavoro che li chiude — e questo resta com'è. Una
> matrice che si aggiorna da sola smette di poter rispondere alla domanda «era già così?».

# Matrice di audit — Ordine cliente manuale

**Data:** 28/08/2026 · **Ramo misurato:** `feature/pagamenti-tesoriera` (HEAD `166e7cb9`, più l'albero di lavoro non committato)
**Fonte normativa:** `docs/18-specifica-ordine-cliente-manuale.md` (1632 righe) — documento dichiarato in testata «candidata da revisionare e approvare»
**Documento di contrasto:** `docs/17-specifica-ordine-fornitore.md`
**Mandato:** §30 della specifica.
**Modalità:** sola lettura. Nessun file modificato dall'audit, nessuna migration, nessun test eseguito dagli analisti.

## Metodo, e i suoi due limiti dichiarati

Censimento su 8 dimensioni, ciascuna poi attaccata da un **falsificatore indipendente** che ha riaperto i corpi delle funzioni con il mandato di demolire i verdetti — con priorità ai `CONFORME`, perché un falso conforme dice al proprietario che una cosa rotta funziona. In caso di smentita prevale il falsificatore, salvo evidenza più debole.

⚠️ **Limite 1 — l'albero si è mosso durante la misura.** La prima corsa ha perso cinque agenti per errore di connessione ed è stata ripresa: nove risultati provengono dalla cache della prima corsa, otto dalla ripresa. Fra le due, l'albero di lavoro ha ricevuto la correzione del motore `StockReservation` sul cambio variante. **Un esito lo dichiara esplicitamente** («già corretto nell'albero non committato»); per gli altri della dimensione D3 la misura può riflettere il codice di prima. Chi lavora su D3 riverifichi sul codice corrente.

⚠️ **Limite 2 — i conteggi sono stati ricalcolati a valle.** La prima stesura di questo documento portava tre serie di numeri incoerenti fra loro (102 in testata, 113 in §1, 118 righe reali nelle tabelle). Le tabelle qui sotto sono state **ricontate meccanicamente dalle righe di §2** e sono ora l'unica fonte. Le righe di §2 non sono state toccate.

## Esiti — 118 righe di matrice

| Stato                | N.  |
| -------------------- | --- |
| ✅ CONFORME          | 66  |
| ⛔ NON CONFORME      | 27  |
| ⚠️ PARZIALE          | 20  |
| ❔ NON VERIFICABILE  | 1   |
| ⏸ DECISIONE MANCANTE | 4   |

⚠️ **Una riga vale due cose a seconda di dove si guarda, ed è l'unica.** OC-MAN-013 (cambio
variante, riga 106) è ⛔ **NON CONFORME su HEAD `166e7cb9`** e ✅ **CONFORME nell'albero di
lavoro non committato**, dove la correzione è completa e coperta da 18 prove. È contata come
CONFORME perché il conteggio segue l'albero misurato. **Su HEAD le non conformità sono 28.**

⭐ **La decisione centrale che questo audit consegna:** i difetti veri non sono ventotto indipendenti. Sono **quattro cause radice**, e ciascuna ne fa cadere un gruppo intero. Correggerne una alla volta nell'ordine sbagliato produce ordini irraggiungibili invece che ordini corretti.

---

## 1. Il quadro in una tabella

| #   | Dimensione                                                | ✅     | ⛔     | ⚠️     | ❔    | ⏸     | Tot     |
| --- | --------------------------------------------------------- | ------ | ------ | ------ | ----- | ----- | ------- |
| D1  | Stati funzionali e default                                | 6      | 6      | 1      | 0     | 1     | 14      |
| D2  | Colonna Impegna magazzino                                 | 6      | 4      | 2      | 0     | 0     | 12      |
| D3  | Impegnata: creazione, rilascio, idempotenza               | 11     | 0      | 3      | 0     | 1     | 15      |
| D4  | Lo stato non governa la gestione del documento            | 13     | 1      | 2      | 0     | 1     | 17      |
| D5  | Concluso, forceConclude e collegamenti                    | 6      | 5      | 3      | 1     | 0     | 15      |
| D6  | Nessun parziale: workflow, residui, `partially_fulfilled` | 4      | 6      | 2      | 0     | 0     | 12      |
| D7  | Righe per differenza, testata, tenant e Location          | 10     | 3      | 3      | 0     | 0     | 16      |
| D8  | Listino, Netto/Ivato e gating Shopify                     | 10     | 2      | 4      | 0     | 1     | 17      |
|     | **Totale**                                                | **66** | **27** | **20** | **1** | **4** | **118** |

Ogni regola compare **una volta sola**, sotto la dimensione che la governa: la somma di riga è anche il totale distinto.

**Concentrazione dei difetti.** Su 28 non conformità, **20 discendono da quattro righe di codice**:

| Causa radice                                                               | File:riga                                                                  | Regole che fa cadere |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------- |
| ⛔ Il ramo `fullyCovered` decide lo STATO, non solo l'etichetta            | `api/src/documents/documents.service.ts:3493-3501`                         | 8                    |
| ⛔ Lo stato manuale non ha una colonna: è derivato da tre campi del canale | `api/prisma/schema.prisma` modello `SalesOrder`                            | 6                    |
| ⛔ L'eleggibilità Includi/Genera guarda `documentId`, non lo stato         | `api/src/sales-orders/sales-order-query.util.ts:80-86`                     | 3                    |
| ⛔ Il predicato di visibilità colonne non conosce lo stato                 | `src/app/features/sales-orders/customer-order-form.component.ts:2128-2158` | 3                    |

---

## 2. La matrice

### D1 — Stati funzionali e default

| Regola                                                                        | Stato                | Evidenza                                                                                                                                                                                                                                                                                                         | File/simbolo                                                                                             | Divergenza                                                                                                                                                                                      | Impatto                                                                                                                             |
| ----------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| §2.1 — Gli stati sono QUATTRO: Da confermare, Confermato, Concluso, Annullato | ⛔ NON CONFORME      | L'enum ne dichiara quattro ma il quarto è quello vietato: `ManualOrderState = { Confirmed, Cancelled, Concluded, PartiallyConcluded }`. «Da confermare» compare **zero volte** in `src/` e `api/`                                                                                                                | `src/app/core/models/sales-order.model.ts:204-209` · `:213-226` `manualOrderState()`                     | Manca `Da confermare`; al suo posto c'è `PartiallyConcluded`, che §2.1 vieta. Due commenti — uno client (`:201`), uno API (`save-manual-sales-order.dto.ts:109`) — dichiarano la regola opposta | Nessun ordine può essere registrato «preso ma non attivo»: qualunque salvataggio impegna magazzino subito                           |
| §2.4 — `Da confermare` richiede persistenza esplicita                         | ⛔ NON CONFORME      | Censimento a 4 livelli: nessuna colonna di stato manuale nel modello `SalesOrder` (solo `financialStatus`, `fulfillmentStatus`, `cancelledAt`, `fulfilledAt`); DTO `@IsIn(['confirmed','cancelled'])`; form a due valori; unica traduzione stato→persistenza è `cancelledAt = status === 'cancelled' ? … : null` | `api/prisma/schema.prisma` mod. `SalesOrder` · `api/src/sales-orders/manual-sales-orders.service.ts:405` | Il requisito v1 non è realizzabile senza migration. §2.4 lascia però esplicitamente aperta **quale** rappresentazione                                                                           | «Confermato» e «mai deciso» sono lo stesso identico record                                                                          |
| §2.1/§7.4 — `Parzialmente concluso` non esiste nel workflow manuale           | ⛔ NON CONFORME      | `data: fullyCovered ? { fulfilledAt: new Date(), fulfillmentStatus: fulfilled } : { fulfillmentStatus: partially_fulfilled }` — a copertura ridotta `fulfilledAt` resta `null`                                                                                                                                   | `api/src/documents/documents.service.ts:3493-3501`                                                       | §7.4 prescrive «se procede, l'ordine è comunque Concluso». Il codice fa il contrario, e mostra l'etichetta in maschera, elenco ed export                                                        | Un DDT che non copre tutto lascia l'ordine in uno stato che la specifica non riconosce                                              |
| §4.3 — Transizione `Confermato → Da confermare`                               | ⛔ NON CONFORME      | Il DTO rifiuta il terzo valore (ValidationPipe globale con `whitelist`+`forbidNonWhitelisted`, `api/src/main.ts:55-63`); il servizio è binario: `if (isSettled) {} else if (status === 'confirmed' && dto.locationId) {…sync…} else {…release…}`                                                                 | `api/src/sales-orders/manual-sales-orders.service.ts:499-525`                                            | La transizione non esiste e non è esprimibile. Il **meccanismo di rilascio esiste già** ed è il ramo `else`                                                                                     | Chi vuole sospendere un ordine liberando merce deve annullarlo, che significa un'altra cosa                                         |
| §4.4 — Transizione `Da confermare → Confermato`                               | ⛔ NON CONFORME      | Stessa impossibilità dal lato opposto. Il ramo di arrivo esiste ed è corretto (`syncOrderReservationsTx` con filtro `effectiveCommits`)                                                                                                                                                                          | `api/src/sales-orders/manual-sales-orders.service.ts:501-518`                                            | Non esiste un momento di attivazione: l'ordine impegna dal primo salvataggio                                                                                                                    | Chi registra ordini in bozza commerciale sottrae disponibilità da subito                                                            |
| §20.1 — Il filtro Stato deve avere quattro voci                               | ⛔ NON CONFORME      | Tre voci in tre punti concordi: `stateOptions` client, `API_STATE_VALUES`, `buildStateFilter` con tre soli `case`                                                                                                                                                                                                | `api/src/sales-orders/sale-order.enum-mapper.ts:33-40` · `sales-order-query.util.ts:126-144`             | Il requisito §20.1 è **condizionato all'approvazione** della specifica. Nel merito la non conformità è certa                                                                                    | La voce `open` **raccoglie anche i `partially_fulfilled`**: «Aperto/Confermato» contiene ordini etichettati «Parzialmente concluso» |
| §8.1 — `Concluso → altri stati` non via selettore                             | ⚠️ PARZIALE          | UI conforme (`@if (isSettledOrder()) { <p class="doc-form__readonly">…`). API **non protetta**: le guardie di `save` sono solo esistenza, origine e scope sede; nessuna legge `fulfilledAt`                                                                                                                      | `api/src/sales-orders/manual-sales-orders.service.ts:327-345`                                            | `POST manual/save` con `{id, status:'cancelled'}` su un ordine Concluso risponde 200 e lo mostra Annullato                                                                                      | Nessuno oggi dalla UI; il rischio è per integrazione e per il momento in cui gli stati verranno estesi                              |
| §9.2 — Resa colonna `Impegna` in `Concluso`                                   | ⏸ DECISIONE MANCANTE | §2.2 «DECISIONE UI DA CHIUDERE: vedi §9.2»; §9.2 «deve essere confermata dall'owner». **Ma §9.2 riga 470 contiene un divieto già approvato** (⛔), oggi violato — vedi §3.6                                                                                                                                      | `customer-order-form.component.ts:2128` · `:1308`                                                        | Non deliberato è _quale_ dei due rimedi; il divieto di lasciare una spunta inerte è norma vigente                                                                                               | L'operatore può spuntare/despuntare e salvare: non accade nulla, nessun messaggio                                                   |
| §2.1 — Stato iniziale proposto = `Confermato`                                 | ✅ CONFORME          | Tre porte di creazione, tutte su `confirmed`: form (`:661`), server (`?? 'confirmed'`, `:135`), duplicazione (DTO senza `status`, `:904-931`)                                                                                                                                                                    | `api/src/sales-orders/manual-sales-orders.service.ts:135`                                                | —                                                                                                                                                                                               | Comportamento prescritto                                                                                                            |
| §2.4 — Nessuna simulazione di `Da confermare`                                 | ✅ CONFORME          | `onStateSelect` accetta solo due valori e scarta il resto; derivatore ancorato a colonne reali; nessun `financialStatus = pending` usato come bozza                                                                                                                                                              | `customer-order-form.component.ts:4506-4512`                                                             | —                                                                                                                                                                                               | Nessun debito da smontare prima della migration                                                                                     |
| §6.4 — Riattivazione `Annullato → Confermato`                                 | ✅ CONFORME          | ⭐ Regge per una ragione non dichiarata: `syncOrderReservationsTx` legge gli impegni **senza filtro `status`**, ritrova il `released`, calcola `delta = q − 0` e lo riporta ad `active`                                                                                                                          | `api/src/order-reservations/stock-reservation.service.ts:68-73` · `:313-345`                             | —                                                                                                                                                                                               | Comportamento prescritto, ma **emergente**: nessun test lo protegge con quel nome                                                   |
| §6.2/§6.3 — Annullato rilascia, idempotente, Giacenza invariata               | ✅ CONFORME          | Doppia guardia: `findMany({status: active})` più `updateMany({where:{id, status:active}})` con uscita a `count === 0`. `applyCommittedDelta` non nomina mai `onHand`                                                                                                                                             | `stock-reservation.service.ts:125-140` · `:364-372`                                                      | —                                                                                                                                                                                               | ⚠️ Regge **per vacuità** sul ramo `isSettled`: vedi §3 nota tecnica                                                                 |
| §7.2 — `Concluso` nasce solo dal salvataggio del documento                    | ✅ CONFORME          | `Concluded` non è fra le `stateOptions`; `concludePrefill` è di sola lettura (nessun `update`/`create`/`$transaction` nel corpo); lo stato cambia in `confirmDocumentTx`                                                                                                                                         | `manual-sales-orders.service.ts:649-748` · `documents.service.ts:2580-2583`                              | —                                                                                                                                                                                               | Aprire il documento generato e chiuderlo non conclude nulla                                                                         |
| §8.2 — Il selettore non produce effetti prima del salvataggio                 | ✅ CONFORME          | `onStateSelect` ha due istruzioni; `grep "controls.status"` sull'intero file dà due occorrenze: una scrittura, una lettura al salvataggio                                                                                                                                                                        | `customer-order-form.component.ts:4506-4512`                                                             | —                                                                                                                                                                                               | Cambiare stato e chiudere senza salvare non lascia traccia                                                                          |

---

### D2 — Colonna Impegna magazzino

| Regola                                                                                                            | Stato           | Evidenza                                                                                                                                                                                                                                                                                                                 | File/simbolo                                                                               | Divergenza                                                                                                                                                                                     | Impatto                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §9.2 — `Annullato → colonna nascosta`                                                                             | ⛔ NON CONFORME | `isLineColumnVisible` ha tre cancelli: catalogo del tipo, caso seriali, preferenza utente. Nessun riferimento a `orderState`, `isConcluded`, `cancelledAt`                                                                                                                                                               | `customer-order-form.component.ts:2128-2158`                                               | La colonna resta visibile con le spunte accese su un ordine i cui impegni il server ha già rilasciato                                                                                          | La riga dice il contrario di ciò che il magazzino registra                                                                                                                              |
| §9.2 — `Da confermare → colonna nascosta`                                                                         | ⛔ NON CONFORME | Lo stato non esiste, e il predicato non ha alcun punto di aggancio per uno stato                                                                                                                                                                                                                                         | `customer-order-form.component.ts:2128` · `sales-order.model.ts:213`                       | Divergenza **latente**: nessun percorso porta oggi in quello stato                                                                                                                             | Nessuno oggi; certo il giorno della migration                                                                                                                                           |
| §9.2 «Concluso» — ⛔ «non è ammesso lasciare una checkbox apparentemente operativa che non comanda alcun effetto» | ⛔ NON CONFORME | ⭐ Il falsificatore ha ribaltato il DECISIONE_MANCANTE del censimento: §9.2 riga 470 è un **divieto marcato ⛔**, non un punto da deliberare. Tre gambe verificate: visibile (`:2128`), operabile dopo Sblocca (`canUnlockDocument` non esclude il concluso, `:1284-1286`), inerte (`if (isSettled) {}`, API `:499-500`) | `customer-order-form.component.ts:1284` · `manual-sales-orders.service.ts:499`             | Non deliberato è **quale rimedio**; il divieto è vigente e violato                                                                                                                             | §7.5 conferma che modificare un Concluso è previsto: il caso non è teorico                                                                                                              |
| §9.4 — L'intento non si deriva da «ha una variante»                                                               | ⛔ NON CONFORME | `commitsStock: Boolean(line.variantId)` in `onDocumentIncluded`. Nulla corregge dopo: `refreshAllLineSummaries` scrive solo `articleCode`                                                                                                                                                                                | `customer-order-form.component.ts:4453` · `:3061-3088`                                     | ⚠️ **Correzione del falsificatore:** il secondo percorso citato (`:2093`) è DDT-only (`if (!fromDocument \|\| !this.isSalesDdt) return`) e non riguarda l'Ordine. Il verdetto regge sull'altro | ⭐ **Amplificazione non vista dal censimento:** l'intento sbagliato è propagato dal server al documento di scarico come `loadsStock` (`:746`) — da impegno diventa **movimento fisico** |
| §9.3 — Nascondere la colonna non deve distruggere i dati di riga                                                  | ⚠️ PARZIALE     | `commitsStock: line.commitsStock ?? true` applicato indistintamente a riga nuova ed esistente, mentre a otto righe di distanza il Codice IVA ha il contratto binario, con commento «QUI MANCAVA»                                                                                                                         | `api/src/sales-orders/manual-sales-order.util.ts:187` vs `:150-160`                        | Il server non ha guardia: un payload che ometta la spunta la riaccende su tutte le righe. Regge solo perché il client la manda sempre                                                          | Latente oggi, **certo** appena §9.2 sarà implementato                                                                                                                                   |
| §9.4 — Servizi non producono Impegnata                                                                            | ⚠️ PARZIALE     | `effectiveCommits` seleziona `kind` dal database (`:183`) e **non lo legge mai**: l'unica condizione è `managesStock !== false`. La regola canonica del progetto è `!servizio && !nonGestito`                                                                                                                            | `manual-sales-orders.service.ts:302-308` vs `document-line-article-resolver.util.ts:89-92` | ⚠️ §5.2 riga 275 pretende la barriera «anche se il dato UI fosse valorizzato erroneamente» — cioè esattamente dove non c'è                                                                     | Un servizio con «Gestisce giacenze» acceso genera reservation, e il valore va anche verso Shopify                                                                                       |
| §9.1 — `Impegna` distinto da `Carica`/`Scarica`                                                                   | ✅ CONFORME     | ⚠️ **Evidenza corretta dal falsificatore:** DDT e Vendita manuale **non usano `loadsStock`** — riusano lo stesso id `commitsStock` rietichettato «Scarica mag.». La separazione vera sta nel DB e nel payload                                                                                                            | `customer-order-line-columns.config.ts:107-122` · `schema.prisma:1475`                     | —                                                                                                                                                                                              | Nel salvataggio dell'ordine non esiste una sola scrittura di `StockMovement`                                                                                                            |
| §9.2 — `Confermato → colonna visibile`                                                                            | ✅ CONFORME     | Nessun `defaultVisible: false`; resa su desktop e su card                                                                                                                                                                                                                                                                | `customer-order-line-columns.config.ts:59`                                                 | —                                                                                                                                                                                              | ⚠️ I preset `Accountant` e `Analysis` non la contengono: preferenza, non policy                                                                                                         |
| §9.3 — Intento ≠ effetto reservation                                                                              | ✅ CONFORME     | Il flag è scritto per **tutte** le righe nel ciclo di persistenza, e solo dopo si entra nel ramo impegni. `releaseReservationTx` non tocca `sales_order_lines`                                                                                                                                                           | `manual-sales-orders.service.ts:446-478` · `stock-reservation.service.ts:364-375`          | —                                                                                                                                                                                              | L'intento sopravvive al ciclo Annullato → Confermato                                                                                                                                    |
| §9.3 — Riattivazione riconcilia                                                                                   | ✅ CONFORME     | `currentRemaining = 0` per ogni stato ≠ active; `updateReservationTx` riscrive `status: active`                                                                                                                                                                                                                          | `stock-reservation.service.ts:100-111` · `:313-334`                                        | —                                                                                                                                                                                              | —                                                                                                                                                                                       |
| §9.4 — Righe informative non impegnano                                                                            | ✅ CONFORME     | Tre difese: `@if (!view().isReference)` desktop, componente diverso su card, `commitsStock: false` alla creazione                                                                                                                                                                                                        | `document-line-row.component.html:545`                                                     | ⚠️ La difesa server verifica `!variantId`, **non** `isReference`: vale per accidente                                                                                                           | Nessuno                                                                                                                                                                                 |
| §9.4 — Non far fallire l'ordine                                                                                   | ✅ CONFORME     | `effectiveCommits` compare tre volte, sempre come argomento di `filter`, mai in un rifiuto                                                                                                                                                                                                                               | `manual-sales-orders.service.ts:502`                                                       | —                                                                                                                                                                                              | —                                                                                                                                                                                       |

---

### D3 — Impegnata: creazione, rilascio, idempotenza

| Regola                                                                  | Stato                                                                      | Evidenza                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | File/simbolo                                                                        | Divergenza                                                                                                                                                    | Impatto                                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §11.3 · OC-MAN-013 — Cambio variante neutralizza la vecchia reservation | ✅ CONFORME **nell'albero di lavoro** — ⛔ NON CONFORME su HEAD `166e7cb9` | ⭐ **Rimisurato il 28/08/2026 a correzione completata.** `updateReservationTx` scrive `variantId` (`:378`); il fast-path confronta la variante prima di uscire (`:125-132`); su cambio di combinazione applica due delta interi su varianti diverse (`:397-409`), per differenza solo a combinazione invariata (`:414-420`). ⭐ **Falsificato rimettendo i difetti uno alla volta**: fast-path cieco alla variante → 7 prove rosse; `variantId` non scritto + delta sulla variante vecchia → 10 rosse | `api/src/order-reservations/stock-reservation.service.ts:125-132` · `:353-421`      | Nessuna nell'albero corrente. Su HEAD l'impegno resta sulla variante vecchia, e a quantità e sede invariate **non si scrive nulla**                           | ✅ **Coperto da 18 prove nuove** in `stock-reservation.service.spec.ts` (24 in tutto). Suite API 207 file / 2116 prove verdi, `nest build` pulito, lint pulito                       |
| §3.2 · OC-MAN-007 — Il warning deve dire la verità                      | ⚠️ PARZIALE                                                                | `requested` è per VARIANTE, `line.quantity` è per RIGA. Due righe da 4 con giacenza 5: `residual = max(0, 8−3) = 5` → «richiesti 4, disponibili solo 5». Client: confronto per riga, il dialogo **non si apre**                                                                                                                                                                                                                                                                                       | `manual-sales-orders.service.ts:550-558` · `customer-order-form.component.ts:3133`  | ⭐ Il falsificatore ha aggravato: tace anche l'avviso ambra sulla **cella** dopo il salvataggio, perché `lineEffectiveAvailable` riaggiunge l'impegno proprio | Chi spezza lo stesso articolo su due righe impegna oltre giacenza senza segnale prima, e dopo legge un avviso che sembra rassicurarlo                                                |
| §14.4 — Retry e risposta persa                                          | ⚠️ PARZIALE                                                                | Doppio clic protetto lato client (`if (this.saving()…) return`). **Nessuna chiave di idempotenza esiste**: `grep -rniE "idempotency\|dedupeKey" api/src src/app` trova solo il ciclo online                                                                                                                                                                                                                                                                                                           | `manual-sales-orders.service.ts:436-438` · `customer-order-form.component.ts:4717`  | Risposta persa → secondo `POST` senza `id` → **secondo ordine con secondo set di reservation**                                                                | Impegnata contata due volte; nessuna verifica automatica se ne accorge. Precedente esistente: `OnlineOrderEvent.dedupeKey`                                                           |
| §4.2 — In `Da confermare` nessun impegno attivo                         | ⏸ DECISIONE MANCANTE                                                       | Lo stato non è rappresentabile. ⭐ Il **meccanismo esiste già**: il ramo `else` di `:519` è un `else` sullo stato, non un ramo scritto per `cancelled`                                                                                                                                                                                                                                                                                                                                                | `save-manual-sales-order.dto.ts:169-172` · `manual-sales-orders.service.ts:519-525` | Non c'è una norma implementabile: c'è una decisione tecnica da prendere (§2.4 non sceglie la rappresentazione)                                                | Nessuno oggi                                                                                                                                                                         |
| §5.2 — Effetto valutato PER RIGA                                        | ✅ CONFORME                                                                | Input chiavato su `salesOrderLineId`; il DB lo impone (`@unique`)                                                                                                                                                                                                                                                                                                                                                                                                                                     | `stock-reservation.service.ts:104-112` · `schema.prisma:1592`                       | —                                                                                                                                                             | ⭐ **Rimisurato:** l'avvertenza «dimostra ordine/riga/Location ma non il legame con la variante» **non vale più**. Il legame riga↔variante è ora scritto e coperto (vedi OC-MAN-013) |
| §6.2 — Annullato rilascia tutto                                         | ✅ CONFORME                                                                | ⚠️ **Motivazione corretta dal falsificatore:** non è vero che `confirmed` sia l'unico ramo alternativo — il primo è `isSettled`, e su un ordine evaso il salvataggio Annullato non chiama né sync né release. Regge **per vacuità**                                                                                                                                                                                                                                                                   | `manual-sales-orders.service.ts:499-500` · `documents.service.ts:3465-3478`         | —                                                                                                                                                             | Verificati i due soli scrittori di `fulfilledAt`: entrambi svuotano gli impegni prima                                                                                                |
| §7.3/§7.5 — L'evaso non conserva impegni attivi                         | ✅ CONFORME                                                                | Il consumo è **incondizionato** e precede il calcolo di `fullyCovered`                                                                                                                                                                                                                                                                                                                                                                                                                                | `documents.service.ts:3443-3478`                                                    | —                                                                                                                                                             | Il ramo `isSettled` vuoto è corretto **solo finché** il collegamento consuma tutto                                                                                                   |
| §11.3 · OC-MAN-010/011 — Idempotenza in creazione                       | ✅ CONFORME                                                                | Delta per differenza a combinazione invariata, valore assoluto sulla reservation. Verificato anche il caso «righe rimandate senza id»: `onDelete: SetNull` + rilascio. ⭐ Rimisurato: il secondo salvataggio dello stesso stato finale non produce **alcun** delta né scrittura, prova dedicata                                                                                                                                                                                                       | `stock-reservation.service.ts:120-136` · `schema.prisma:1610`                       | —                                                                                                                                                             | ⚠️ Vale per la **modifica**; sulla creazione vedi §14.4                                                                                                                              |
| §3.2/§11.4 — Insufficienza non bloccante (API)                          | ✅ CONFORME                                                                | Nove `throw` in `save`, nessuno sulla disponibilità; nessun `Validators.max`; `available` senza vincolo di non-negatività                                                                                                                                                                                                                                                                                                                                                                             | `manual-sales-orders.service.ts:527-561` · `schema.prisma:876-877`                  | —                                                                                                                                                             | —                                                                                                                                                                                    |
| §3.2 — Insufficienza non bloccante (UI)                                 | ✅ CONFORME                                                                | Dialogo a due vie, «Salva comunque» primary, `confirmAvailabilityDialog` chiama davvero `saveDocument()`                                                                                                                                                                                                                                                                                                                                                                                              | `customer-order-form.component.ts:4791-4837`                                        | —                                                                                                                                                             | ⚠️ Vale **quando l'avviso scatta**; nel caso multi-riga non scatta                                                                                                                   |
| §5.3 — Nessun movimento fisico                                          | ✅ CONFORME                                                                | `applyCommittedDelta` scrive solo `committed`/`available`; nessun `stockMovement` nel modulo                                                                                                                                                                                                                                                                                                                                                                                                          | `committed-delta.util.ts:30-33`                                                     | —                                                                                                                                                             | —                                                                                                                                                                                    |
| §5.2/§9.4 — Servizi esclusi                                             | ⚠️ PARZIALE                                                                | Vedi D2: `kind` selezionato e mai letto                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `manual-sales-orders.service.ts:302-308`                                            | —                                                                                                                                                             | —                                                                                                                                                                                    |
| §6.4 — Annullato → Confermato ricostruisce                              | ✅ CONFORME                                                                | Riattivazione in posto, un solo delta. ⭐ Rimisurato: un impegno `released` che rientra su una **variante diversa** impegna la nuova per intero e non restituisce nulla alla vecchia (`currentRemaining` = 0 se non attivo, `:370-372`), prova dedicata                                                                                                                                                                                                                                               | `stock-reservation.service.ts:120-136` · `:370-372`                                 | —                                                                                                                                                             | —                                                                                                                                                                                    |
| §10.4 · OC-MAN-014 — Cambio Location per differenza                     | ✅ CONFORME                                                                | Un solo `update` su `current.id`, due delta opposti nella stessa transazione; scope sede verificato su **entrambe** le sedi. ⭐ Rimisurato: il ramo non è più «solo sede» ma `keyChanged = variantChanged                                                                                                                                                                                                                                                                                             |                                                                                     | locationChanged` (`:364`), quindi variante e sede insieme si muovono in un colpo solo — prova dedicata                                                        | `stock-reservation.service.ts:397-409` · `manual-sales-orders.service.ts:163`, `:342`                                                                                                | —   | Nessuna finestra con doppio impegno |
| §23.1 — Tenant-scoped, unica autorità                                   | ✅ CONFORME                                                                | ⚠️ **Evidenza corretta:** esistono due scritture dirette fuori dal servizio, nel ripristino da backup — tenant-scoped e coerenti con l'`InventoryLevel` dello stesso snapshot                                                                                                                                                                                                                                                                                                                         | `tenant-backup-import.service.ts:322`, `:581`                                       | —                                                                                                                                                             | «Nessun altro scrittore» era più largo del vero                                                                                                                                      |

---

### D4 — Lo stato non governa la gestione del documento

| Regola                                                                        | Stato                | Evidenza                                                                                                                                                                                                          | File/simbolo                                                                        | Divergenza                                                                                                                                                                                     | Impatto                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §15.2 — L'eliminazione non deve perdere la tracciabilità del documento emesso | ⛔ NON CONFORME      | Il collegamento vive in un solo posto, la colonna sul figlio. `delete()` non carica `documentId` nella `select` e chiude con `tx.salesOrder.delete`. Cascate portano via anche lo storico impegni                 | `manual-sales-orders.service.ts:823-834`, `:872` · `schema.prisma:1358`, `:1609`    | ⭐ **Asimmetria misurata dal falsificatore:** la direzione opposta è protetta con cura — un DDT confermato non si elimina, e annullandolo il codice riapre gli ordini e ripristina gli impegni | Il DDT resta con la sola riga di testo «Rif. Ordine cliente N. …» che non punta a nulla; il pannello ordini collegati risulta vuoto. Il dialogo di conferma non lo avverte |
| §15.2 — Nessun collegamento orfano                                            | ⚠️ PARZIALE          | Nessun orfano di chiave esterna (tutte Cascade tranne `OnlineSale` Restrict, intercettato). Resta il riferimento **testuale** nel documento                                                                       | `schema.prisma:1481`, `:1545`, `:1609`, `:1716`                                     | Riflesso dello stesso difetto                                                                                                                                                                  | ⚠️ Ripulire quella riga sarebbe la correzione sbagliata: riscriverebbe un documento salvato                                                                                |
| §18.2 — Lo stato governa l'eleggibilità come sorgente                         | ⚠️ PARZIALE          | ⭐ Il falsificatore ha degradato il CONFORME: sul percorso **Includi** né il filtro server né la transazione leggono `fulfilledAt` — l'esclusione arriva da `documentId`, e il codice lo dichiara in due commenti | `sales-order-query.util.ts:80-86` · `documents.service.ts:1476-1497`                | §18.2 pretende la garanzia «Concluso → NO» su UI, API e transazione                                                                                                                            | Coincide solo finché regge l'invariante «Concluso ⟹ documentId valorizzato», che nessuna guardia impone                                                                    |
| §15.3 — Ordine con collegamento definitivo non eliminabile                    | ⏸ DECISIONE MANCANTE | Titolo: «Decisione di prodotto da confermare»; testo: «**Raccomandazione:**»; chiusura: «deve essere approvata dall'owner»                                                                                        | `docs/18…md:744-750`                                                                | Non applicabile                                                                                                                                                                                | La procedura presupposta esiste già (`reopenManualOrderRecordTx`)                                                                                                          |
| §16 — Clic di riga → Modifica, per ogni stato                                 | ✅ CONFORME          | Lo stato è stato tolto dalla **firma**: `documentRowPath({id, type}, user)`. Il file dichiara in testa «`DocumentStatus` non compare più: dal 27/08/2026 lo STATO non entra nella decisione»                      | `document-routing.util.ts:303-317`                                                  | —                                                                                                                                                                                              | ⚠️ Il test guardia (`:158`) copre Quote/Transfer/StoreSale: **l'Ordine cliente non ha una prova propria**                                                                  |
| §16 — Ricerca globale e link coerenti                                         | ✅ CONFORME          | La ricerca usa lo **stesso** risolutore dell'elenco                                                                                                                                                               | `global-search.component.ts:244`                                                    | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §16 — Rotta di edit non chiusa per stato                                      | ✅ CONFORME          | Solo `tenantPermissionGuard`; `getById` non filtra per stato                                                                                                                                                      | `sales-orders.routes.ts:49-60` · `sales-orders.service.ts:173-176`                  | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §16/§7.5 — Nessuna guardia di stato sul Salva                                 | ✅ CONFORME          | I soli rifiuti sull'esistente: 404 e origine. `isSettled` sceglie un ramo, non rifiuta. Verificato anche `duplicate()`, che riusa `save` senza guardie proprie                                                    | `manual-sales-orders.service.ts:334-340`                                            | —                                                                                                                                                                                              | Un Concluso si risalva senza ricreare impegni; un Annullato torna Confermato                                                                                               |
| §16 — Nessuna guardia di stato sull'Elimina                                   | ✅ CONFORME          | La `select` non carica nemmeno i campi di stato                                                                                                                                                                   | `manual-sales-orders.service.ts:824-834`                                            | —                                                                                                                                                                                              | ⚠️ La stessa `select` è la causa del NON_CONFORME su §15.2                                                                                                                 |
| §16 — Lock/sblocco indipendente dallo stato                                   | ✅ CONFORME          | Per l'Ordine `isConfirmedEdit` prende il primo ramo: «esiste già»                                                                                                                                                 | `customer-order-form.component.ts:1294-1300`                                        | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §16 — Permessi non per stato                                                  | ✅ CONFORME          | Decoratori per permesso su tutte le rotte, gate di classe `SectionSales`                                                                                                                                          | `sales-orders.controller.ts:60-61`                                                  | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §16/§17.1 — Le limitazioni vengono da origine, permessi, gate, lock           | ✅ CONFORME          | Origine, feature gate Vendita manuale, scope sede, Vendita online collegata (`Restrict`)                                                                                                                          | `manual-sales-orders.service.ts:336`, `:665`, `:846`, `:854`                        | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §15.2 — Reservation rilasciate nella stessa transazione                       | ✅ CONFORME          | Rilascio e `salesOrder.delete` nello stesso `$transaction`; `applyCommittedDelta` negativo                                                                                                                        | `manual-sales-orders.service.ts:859-873`                                            | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §15.2 — Nessun movimento fisico dall'eliminazione                             | ✅ CONFORME          | Tre sole operazioni; `pushInventoryTargets` è sola pubblicazione                                                                                                                                                  | `manual-sales-orders.service.ts:874`, `:934-950`                                    | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §15.2 — Documento di destinazione non riscritto                               | ✅ CONFORME          | `tx.document.*` non compare nella transazione                                                                                                                                                                     | `manual-sales-orders.service.ts:859-873`                                            | —                                                                                                                                                                                              | ⚠️ Il documento è intatto; **la sua vista dell'origine no**                                                                                                                |
| §15.2 — Tenant e permessi lato API sull'eliminazione                          | ✅ CONFORME          | Permesso, tenant nel `findFirst`, scope sede                                                                                                                                                                      | `sales-orders.controller.ts:165-173` · `manual-sales-orders.service.ts:824`, `:851` | —                                                                                                                                                                                              | —                                                                                                                                                                          |
| §7.5 — Concluso apribile e salvabile                                          | ✅ CONFORME          | `if (isSettled) {}` è un ramo **vuoto** che precede sia sync sia release                                                                                                                                          | `manual-sales-orders.service.ts:499-501`                                            | —                                                                                                                                                                                              | —                                                                                                                                                                          |

---

### D5 — Concluso, forceConclude e collegamenti

| Regola                                                               | Stato               | Evidenza                                                                                                                                                                                                                                    | File/simbolo                                                                                               | Divergenza                                                                                                                                                                                     | Impatto                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| §2.3/§7.2 — `forceConclude` non va implementato come workflow        | ⛔ NON CONFORME     | Esiste su quattro livelli: servizio (`:757-813`), endpoint `@Post('manual/:id/force-conclude')`, client HTTP, dialogo a tre vie. **Zero test:** `grep -rln forceConclude --include=*.spec.ts` non trova nulla                               | `manual-sales-orders.service.ts:757` · `sales-orders.controller.ts:153-162`                                | §2.3 lo elenca fra le cose da non implementare. La guardia `:782` rifiuta tutto ciò che non sia `partially_fulfilled`: **è la toppa del difetto precedente**                                   | Non atomico: «DDT salvato, ma non è stato possibile forzare a Concluso un ordine incluso» (`:4966-4972`)                                |
| §2.3/§7.4 — Warning con due sole uscite                              | ⛔ NON CONFORME     | Dialogo a **tre** pulsanti: `Annulla` · `No` · `Sì`. `declinePartialOrdersDialog()` è commentato ««No»: salva lasciando gli ordini in «Parzialmente concluso»»                                                                              | `customer-order-form.component.html:1627-1637` · `.ts:4945-4949`                                           | La terza uscita è precisamente il caso vietato                                                                                                                                                 | Due operatori davanti allo stesso DDT producono due esiti diversi, non recuperabili dall'elenco                                         |
| §7.6 — La riapertura del documento riporta l'ordine in includibilità | ⛔ NON CONFORME     | `wasStockUnloaded` è cablato a `doc.type === DocumentType.sales_ddt` (`:2769-2773`), ma lo sgancio `documentId: null` è **incondizionato** (`:3022-3025`). La conferma usa invece il predicato per tipo, che include `invoice_accompanying` | `documents.service.ts:2769` · `:3013` · `:3022`                                                            | ⭐ Il falsificatore ha completato la catena UI (`sales-document-form.component.ts:3098-3113` → `:3187` → `:2738-2739`): **lo stato orfano è raggiungibile dalla normale UI**, non solo via API | Ordine concluso da Fattura accompagnatoria poi annullata: resta «Concluso», senza collegamento, impegni consumati, merce non ricaricata |
| §18.2 — Eleggibilità garantita su UI, API e transazione              | ⛔ NON CONFORME     | Il filtro dichiara nel commento «È il COLLEGAMENTO (documentId) a rendere un ordine non più includibile — non lo stato di evasione». La transazione non seleziona nemmeno `fulfilledAt`                                                     | `sales-order-query.util.ts:78-86` · `documents.service.ts:1432-1441`                                       | ⚠️ **Correzione:** la rotta `includeOrder` della Fattura accompagnatoria **è** protetta (passa da `concludePrefill`); quella del DDT no                                                        | Un ordine concluso orfano ricompare nel pannello e viene agganciato: **doppio scarico** della stessa merce                              |
| §20.3 — Il pannello Includi mostra solo gli eleggibili               | ⛔ NON CONFORME     | Il componente non aggiunge filtri: righe mappate 1:1 dal server                                                                                                                                                                             | `document-include-panel.component.ts:157-181`                                                              | ⚠️ §20.3 rimanda a «§17.2», che è la sezione Shopify: il riferimento inteso è §18.2                                                                                                            | Il pannello può proporre un ordine Concluso orfano                                                                                      |
| §7.3 — Il passaggio a Concluso non è un secondo motore di stock      | ⚠️ PARZIALE         | ⭐ Il falsificatore ha degradato il CONFORME: `forceConclude` è un **secondo** passaggio a Concluso, con `$transaction` propria eseguita dopo il commit, che muove Impegnata/Disponibile                                                    | `manual-sales-orders.service.ts:792`, `:797`                                                               | Resta vero solo l'ultimo trattino (la Giacenza non si muove)                                                                                                                                   | —                                                                                                                                       |
| §18.1 — Una sola infrastruttura con policy per coppia                | ⚠️ PARZIALE         | Quattro fonti discordi: `getMeta` propone 3 tipi; `concludePrefill` li accetta; `canAttachOrders` ne ammette 2; il pannello Includi 1. L'unica barriera per la Vendita manuale è un filtro di UI                                            | `documents.service.ts:1409-1418` · `manual-sales-orders.service.ts:111` · `document-include.util.ts:64-71` | Il commento del codice lo dice già altrove: «Un filtro di UI non è una protezione»                                                                                                             | Prefill 201 e salvataggio 422: l'operatore compila e perde il lavoro                                                                    |
| §18.4 — Nessun motore locale                                         | ⚠️ PARZIALE         | N→1 supportato (FK sul figlio, array nel DTO, ciclo server). Ma quattro meccanismi distinti per la stessa idea: `SalesOrder.documentId`, `Document.sourceDocumentId`, `InvoiceSalesDdtLink`, `PurchaseInvoiceGoodsReceiptLink`              | `schema.prisma:1358`, `:2170`, `:2558`, `:2584`                                                            | Nessun impatto su v1                                                                                                                                                                           | È la ragione per cui le guardie di §18.2 sono diverse in ogni punto                                                                     |
| §18.2 — `Da confermare` non eleggibile                               | ❔ NON VERIFICABILE | Lo stato non esiste: la condizione è vera a vuoto. Il filtro non ha alcun aggancio allo stato                                                                                                                                               | `schema.prisma` mod. `SalesOrder` · `sales-order-query.util.ts:80-86`                                      | —                                                                                                                                                                                              | Domani: nascerebbe includibile se la migration non toccasse anche questo punto                                                          |
| §7.2 — Concluso non selezionabile                                    | ✅ CONFORME         | Due voci in tendina, DTO a due valori, `concludePrefill` di sola lettura                                                                                                                                                                    | `customer-order-form.component.ts:608-611`                                                                 | —                                                                                                                                                                                              | —                                                                                                                                       |
| §7.3 — Neutralizzazione senza duplicare lo scarico                   | ✅ CONFORME         | `consumeReservationTx` tocca solo `committed`; scarico fisico da `syncUnloadLineMovements`                                                                                                                                                  | `stock-reservation.service.ts:151-189`                                                                     | —                                                                                                                                                                                              | —                                                                                                                                       |
| §7.4 — Nessuna Impegnata residua                                     | ✅ CONFORME         | Il ciclo precede `fullyCovered`; la query non filtra per copertura né per sede                                                                                                                                                              | `documents.service.ts:3464-3480`                                                                           | —                                                                                                                                                                                              | —                                                                                                                                       |
| §2.3 — Nessuna seconda evasione                                      | ✅ CONFORME         | Quattro sbarramenti, tre sull'API. ⭐ Il falsificatore ha testato la via che li aggirerebbe (eliminare il documento evasore, `SetNull`): **chiusa** — DDT e Fattura confermati non sono eliminabili                                         | `sales-order-query.util.ts:80-86` · `documents.service.ts:3084-3095`                                       | —                                                                                                                                                                                              | —                                                                                                                                       |
| §7.5 — Concluso modificabile                                         | ✅ CONFORME         | Vedi D4                                                                                                                                                                                                                                     | `manual-sales-orders.service.ts:499`                                                                       | —                                                                                                                                                                                              | —                                                                                                                                       |
| §18.3 — Nessun effetto al solo prefill                               | ✅ CONFORME         | `concludePrefill` ha solo `findFirst` e un `return`; `concludeWith` naviga e basta; il legame si scrive in `syncIncludedSalesOrdersTx` dentro la transazione                                                                                | `manual-sales-orders.service.ts:649-748` · `customer-order-form.component.ts:5542-5556`                    | —                                                                                                                                                                                              | Aprire il documento generato e chiuderlo non lascia traccia                                                                             |

---

### D6 — Nessun parziale: workflow, residui, `partially_fulfilled`

| Regola                                                                           | Stato           | Evidenza                                                                                                                                                                                                        | File/simbolo                                                                                                                        | Divergenza                                                                                                                  | Impatto                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2.1 — Non esiste «Parzialmente concluso»                                        | ⛔ NON CONFORME | Enum + derivazione + **quattro superfici** con chiamanti reali: badge testata (`html:32`), cella Stato (`:396-398`), colonna elenco, export CSV                                                                 | `sales-order.model.ts:208`, `:222`                                                                                                  | Cinque stati dove la specifica ne prevede quattro                                                                           | ⚠️ **Il falsificatore ha verificato che sbloccare non restituisce il selettore:** `formReadOnly` e `isSettledOrder` sono condizioni diverse — l'ordine parziale è **senza transizione verso Annullato** |
| §2.3/§7.4/§18.5 — A copertura ridotta l'ordine è comunque Concluso               | ⛔ NON CONFORME | Il ternario decide **due cose insieme**: etichetta e stato                                                                                                                                                      | `documents.service.ts:3493-3501`                                                                                                    | ⚠️ La nota di §7.4 («decide l'etichetta, non la quantità») **sottostima**: decide anche `fulfilledAt`                       | ⚠️ Le destinazioni che possono produrlo sono **due**, non tre: `manual_unload` non può agganciare ordini (`:1409-1411`)                                                                                 |
| §2.3/§21.8/§23.3 — `forceConclude` non implementato                              | ⛔ NON CONFORME | Vedi D5                                                                                                                                                                                                         | `manual-sales-orders.service.ts:757`                                                                                                | —                                                                                                                           | —                                                                                                                                                                                                       |
| §2.3/OC-MAN-020 — Warning a due uscite                                           | ⛔ NON CONFORME | Vedi D5                                                                                                                                                                                                         | `customer-order-form.component.html:1627-1637`                                                                                      | —                                                                                                                           | —                                                                                                                                                                                                       |
| §17.1/§17.2/§2.1 — Distinzione fra `partially_fulfilled` Shopify e stato manuale | ⛔ NON CONFORME | La stessa colonna scritta dai due mondi. Il filtro server conosce tre stati e classifica il manuale parziale come `open`, mentre la colonna stampa «Parzialmente concluso»                                      | `documents.service.ts:3409-3415`, `:3500` · `sales-order-query.util.ts:128-144`                                                     | Filtro e colonna dicono due cose diverse sulla stessa riga                                                                  | ⚠️ **Correzione del falsificatore:** l'ordine parziale **non è irraggiungibile** — il filtro «Evasione → Evasione parziale» lo seleziona. È classificato sotto un secondo asse                          |
| §21.7 — Regola superata da non reintrodurre                                      | ⛔ NON CONFORME | I commenti citano come fonte vigente «prompt DDT §LOGICA MAGAZZINO», cioè la specifica che §21 supera                                                                                                           | `sales-order.model.ts:199-203` · `manual-sales-orders.service.ts:751-756` · `documents.service.ts:3395-3401`                        | Testo morto che insegna la regola revocata                                                                                  | Chi interviene legge una regola revocata come vigente e la difenderà                                                                                                                                    |
| §2.3/§7.4 — Il warning su ogni destinazione conclusiva                           | ⚠️ PARZIALE     | `grep -c "Parzial"` su `sales-document-form.component.ts` = **0**, e quella maschera aggancia ordini                                                                                                            | `sales-document-form.component.ts:367`, `:2738-2739`                                                                                | ⭐ Prova aggiuntiva: le due destinazioni usano **due motori di prefill diversi** (client per il DDT, server per la Fattura) | Stessa operazione, due comportamenti secondo il documento scelto                                                                                                                                        |
| §21.8/§23.4 — Nessun motore parallelo                                            | ⚠️ PARZIALE     | `forceConclude` con transazione propria; **più** i due motori di prefill                                                                                                                                        | `manual-sales-orders.service.ts:792` · `customer-order-form.component.ts:2004-2016` vs `sales-document-form.component.ts:3106-3110` | §23.4 lo nomina alla lettera                                                                                                | —                                                                                                                                                                                                       |
| §7.3/§7.4 — Nessuna reservation attiva residua                                   | ✅ CONFORME     | ⭐ Il falsificatore ha chiuso il fronte che il censimento non aveva verificato: `applyCommittedDelta` scrive **entrambe** le colonne (`available: { increment: -delta }`), quindi la Disponibile risale davvero | `committed-delta.util.ts:30-33`                                                                                                     | —                                                                                                                           | Senza quella lettura il CONFORME era indimostrato                                                                                                                                                       |
| §2.3 — Nessuna seconda evasione                                                  | ✅ CONFORME     | Vedi D5                                                                                                                                                                                                         | —                                                                                                                                   | —                                                                                                                           | —                                                                                                                                                                                                       |
| §2.3/§22 — Nessun motore di residui                                              | ✅ CONFORME     | `SalesOrderLine` letto per intero: 27 campi, nessuno di evasione o residuo. `reopenLinkedManualOrderTx` è uno storno documentale completo                                                                       | `schema.prisma` mod. `SalesOrderLine` · `documents.service.ts:3546-3572`                                                            | —                                                                                                                           | ⭐ La correzione **non richiede migration di schema**                                                                                                                                                   |
| §17.2/§23.3 — `partially_fulfilled` resta per Shopify                            | ✅ CONFORME     | Mapper, sync ed evento canonico vivi e indipendenti dal manuale                                                                                                                                                 | `shopify-sync.service.ts:726-735`, `:450-455` · `online-order-lifecycle.service.ts:207-220`                                         | —                                                                                                                           | ⛔ **L'enum non va rimosso**: si toglie chi lo scrive su `source = manual`                                                                                                                              |

---

### D7 — Righe per differenza, testata, tenant e Location

| Regola                                                             | Stato           | Evidenza                                                                                                                                                                                                                                                                         | File/simbolo                                                                                                        | Divergenza                                                                                                                                                                          | Impatto                                                                                                                                         |
| ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| §10.4/§15.2 — Autorizzazioni di sede lato API su **ogni** accesso  | ⛔ NON CONFORME | `listManualReservations` non riceve `@CurrentUser()`; il servizio non può verificare. ⭐ **Il falsificatore ha esteso: SEI rotte allegati** sullo stesso controller accedono a un Ordine per id senza controllo di sede, e `attachments.service.ts:65-75` filtra solo per tenant | `sales-orders.controller.ts:127-134` · `:190`, `:196`, `:209`, `:216`, `:231`, `:242`                               | Chi ha i permessi di gestione legge impegni — e **scarica allegati** — di ordini di sedi non sue                                                                                    | Il download di un allegato espone più della coppia variante/quantità                                                                            |
| §11.1 · OC-MAN-024 — Una query di ricerca non è una riga documento | ⛔ NON CONFORME | Il campo `productName` porta **sia** il testo di ricerca sia il titolo della riga; la quantità di default è 1, quindi `isPersistableManualOrderLine` la accetta. Il rifiuto per righe incomplete è nel ramo `isRegistryDocument`, che esclude l'Ordine                           | `customer-order-form.component.ts:3755-3761`, `:2206-2208`, `:499` · `manual-sales-order.util.ts:246-249`           | Non esiste in nessun punto la distinzione «riga tecnica di ricerca»                                                                                                                 | Riga fantasma «magli» da 1 pezzo a prezzo zero, che entra nel PDF e nel documento di scarico. ⚠️ Nessuna reservation: quella parte è rispettata |
| §14.1 — Conferma al primo Salva                                    | ⛔ NON CONFORME | Il dialogo non esiste: sei `app-confirm-dialog` nella maschera, nessuno è quello. `requestSaveDocument` va diritto                                                                                                                                                               | `customer-order-form.component.ts:4717-4720`                                                                        | ⚠️ **Contrasto, non arretrato:** la maschera implementa la convenzione opposta («si salva, si blocca, si resta dentro»), decisa nell'08/2026 e presente anche nell'Ordine fornitore | Un Salva involontario crea un ordine numerato; il contatore non torna indietro                                                                  |
| §10.1 · OC-MAN-025 — Il gate Cliente/Location non aggirabile       | ⚠️ PARZIALE     | ⭐ Il falsificatore ha demolito un CONFORME. `openIncludePanel()` **non ha il controllo sul gate** che i suoi due gemelli hanno, e su schermo compatto il pulsante vive nel **piede** della testata, fuori dal `fieldset[disabled]`                                              | `customer-order-form.component.ts:4363-4366` vs `:1605`, `:1629` · `.html:552-561` vs `:591`                        | ⛔ **Solo su mobile:** con Cliente e Location vuoti si includono righe che poi **non si vedono**, perché la tabella resta nascosta                                                  | Un CONFORME falso su una porta aperta su metà dei dispositivi                                                                                   |
| §14.4 — Retry                                                      | ⚠️ PARZIALE     | Vedi D3                                                                                                                                                                                                                                                                          | `manual-sales-orders.service.ts:436-438`                                                                            | —                                                                                                                                                                                   | —                                                                                                                                               |
| §20 — Elenco ed export rispondono agli stessi filtri               | ⚠️ PARZIALE     | DTO export: due origini contro quattro; mancano `includable`, `missingOnChannel`, `sort`, `all`. **Senza `source` il `where` non filtra l'origine**, e nessuno dei due chiamanti lo passa                                                                                        | `export-sales-orders.query.dto.ts:11` vs `list-sales-orders.query.dto.ts:25-30` · `sales-order-query.util.ts:49-53` | Il file chiamato «corrispettivi-shopify» contiene anche gli Ordini cliente manuali del periodo                                                                                      | Chi lo consegna al commercialista come corrispettivi Shopify vi trova righe manuali                                                             |
| §11.3 — Quantità per differenza                                    | ✅ CONFORME     | Uscita anticipata a **quattro** condizioni, variante compresa                                                                                                                                                                                                                    | `stock-reservation.service.ts:125-132`, `:414-420`                                                                  | —                                                                                                                                                                                   | —                                                                                                                                               |
| §11.3 · OC-MAN-012 — Spunta ON/OFF e riga eliminata                | ✅ CONFORME     | ⭐ Anello aggiunto dal falsificatore: la riga è cancellata **prima** del sync e `onDelete: SetNull` azzera `salesOrderLineId`                                                                                                                                                    | `manual-sales-orders.service.ts:481-484` · `schema.prisma:1610`                                                     | —                                                                                                                                                                                   | —                                                                                                                                               |
| §10.4/§11.3 · OC-MAN-014 — Cambio Location                         | ✅ CONFORME     | Vedi D3                                                                                                                                                                                                                                                                          | —                                                                                                                   | —                                                                                                                                                                                   | —                                                                                                                                               |
| §11.2 — Identità di riga e riordino                                | ✅ CONFORME     | ⭐ Il falsificatore ha verificato il **secondo** percorso di riordino (trascinamento, `removeAt`/`insert`): l'id sopravvive anche lì                                                                                                                                             | `customer-order-form.component.ts:1541-1557`, `:2253-2274`                                                          | —                                                                                                                                                                                   | —                                                                                                                                               |
| §10.1 — Stato vuoto invece di tabella spenta                       | ✅ CONFORME     | La tabella non esiste finché il gate è attivo; il titolo nomina il campo mancante                                                                                                                                                                                                | `customer-order-form.component.ts:1070-1079` · `.html:920-926`                                                      | —                                                                                                                                                                                   | —                                                                                                                                               |
| §10.2 · OC-MAN-023 — Salvataggio senza righe                       | ✅ CONFORME     | DTO senza `@ArrayMinSize`; il servizio prosegue                                                                                                                                                                                                                                  | `save-manual-sales-order.dto.ts:204-209`                                                                            | ⚠️ Commento stantio: `manual-sales-order.util.ts:242-244` afferma ancora la regola §21.5 superata                                                                                   | —                                                                                                                                               |
| §10.3 — `locationId = null` senza fallback nascosto                | ✅ CONFORME     | Tre condizioni di uscita; la predefinita è una preferenza persistita, non la prima sede                                                                                                                                                                                          | `default-location-prefill.util.ts:48-59` · `operational-locations.service.ts:148-154`                               | —                                                                                                                                                                                   | —                                                                                                                                               |
| §11.4 — Disponibile negativa: warning non bloccante                | ✅ CONFORME     | ⭐ Verificati anche la resa a schermo (`html:120-124`) e il ramo «annulla» del dialogo (non corregge nulla)                                                                                                                                                                      | `manual-sales-orders.service.ts:528-561`                                                                            | —                                                                                                                                                                                   | —                                                                                                                                               |
| §10.4 — Tenant-aware                                               | ✅ CONFORME     | Le due scritture senza `tenantId` operano su insiemi già derivati per tenant                                                                                                                                                                                                     | `manual-sales-orders.service.ts:442-443`                                                                            | ⚠️ Protezione **derivata**, non dichiarata: vale anche per `updateReservationTx`                                                                                                    | —                                                                                                                                               |
| §20 — Scope sede uguale fra elenco ed export                       | ✅ CONFORME     | Stesso `buildSalesOrderWhere`, stessa clausola, stesso trattamento dello scope vuoto                                                                                                                                                                                             | `sales-orders-export.service.ts:107-131`                                                                            | ⚠️ **Poggia su lavoro non committato**: il `@CurrentUser()` sull'export è una modifica dell'albero                                                                                  | Su HEAD il CSV esce dal perimetro                                                                                                               |

---

### D8 — Listino, Netto/Ivato e gating Shopify

| Regola                                                              | Stato                | Evidenza                                                                                                                                                                                                                                                                               | File/simbolo                                                                                                                          | Divergenza                                                                                                                                                                              | Impatto                                                                                                                   |
| ------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| §13.3 — Il Listino è selezionabile in testata                       | ⛔ NON CONFORME      | Catena verificata anello per anello: la tendina dipende da `tenantSettings`, che arriva da `GET /tenant/feature-settings`, protetto da `@RequirePermissions(SettingsCompany)`. Manager e commesso non l'hanno ma gestiscono ordini. Il 403 è assorbito da `catchError(() => of(null))` | `customer-order-form.component.ts:881-884`, `:1774` · `tenant-company.controller.ts:34-38` · `tenant-permission.constants.ts:307-334` | Per quei ruoli il Listino non è disabilitato: **non c'è**                                                                                                                               | Il titolare attiva i listini, li spiega ai commessi, e i commessi non vedono la tendina. Nessun messaggio                 |
| §17.3 · OC-MAN-028 — Nessun riferimento Shopify senza il modulo     | ⛔ NON CONFORME      | Il filtro «Origine» del registro generale ritorna **incondizionatamente** «Shopify online» e «Shopify POS»; reso in entrambe le vesti senza `@if`. `grep tenantChannelProfile` sul modulo: solo file `.spec`                                                                           | `sales-order-list.component.ts:243-256` · `.html:166-176`, `:389-398`                                                                 | Il segnale esiste (`showShopifyIntegration`) ed è usato in Prodotti e Giacenze, con precedente esatto per le colonne                                                                    | ⚠️ Anche `{ id: 'onlineSale', label: 'Vendita online' }` sta nel selettore Colonne del registro generale                  |
| §13.1 — Le modifiche all'anagrafica non riscrivono l'ordine storico | ⚠️ PARZIALE          | Modificando l'articolo dal pannello aperto **dalla riga**, `pinVariantSummary` è chiamata senza il quarto argomento → `replacedArticle = false` → `scrivi` scrive comunque i campi identità                                                                                            | `customer-order-form.component.ts:4243-4250` → `:3051` → `:2925-2946`                                                                 | ⚠️ **Correzioni del falsificatore:** si riscrive anche `commitsStock` (`:2953-2956`, tocca §9.3 e le reservation) ed eventualmente lo sconto; `variantLabel` invece **non** si persiste | La riga di marzo cambia descrizione e SKU con quelli di oggi, e al salvataggio successivo diventa il persistito           |
| §13.3 · OC-MAN-026 — Le righe senza prezzo vanno segnalate          | ⚠️ PARZIALE          | `variant: null` significa due cose: «riga senza articolo» e «articolo di cui non conosco i prezzi». Solo la prima è corretta da non segnalare                                                                                                                                          | `customer-order-form.component.ts:3369`, `:3375` · `document-listino.util.ts:131-135`                                                 | ⭐ **Finestra ordinaria, non caso limite:** `refreshAllLineSummaries` azzera `pinnedVariants` all'apertura e la ripopola in modo asincrono                                              | Chi cambia Listino prima che le risposte arrivino non riprezza nulla e non riceve avvisi                                  |
| §13.2 — Memoria dell'operatore                                      | ⚠️ PARZIALE          | `remember()` ha **due** chiamanti in tutto `api/src`, nessuno è l'ordine; `ManualSalesOrdersService` non inietta nemmeno il servizio                                                                                                                                                   | `manual-sales-orders.service.ts:95-102` · `document-price-mode-preference.service.ts:80-92`                                           | Il livello 2 del contratto è inerte: si legge, non si scrive mai                                                                                                                        | L'operatore deve ricambiare la modalità a ogni nuovo Ordine cliente, a differenza di ogni altro documento                 |
| §13.3 — Nessuna seconda matematica economica                        | ⚠️ PARZIALE          | Due motori: sconto stringa a cascata + troncamento intermedio contro percentuale numerica senza troncamento; `discount String?` contro `discountPercent Decimal(7,4)`                                                                                                                  | `manual-sales-order.util.ts:139-191` vs `documents.service.ts:3681-3685`                                                              | Nessuna divergenza **numerica** misurata sui casi normali. Impatto di manutenzione                                                                                                      | ⚠️ Commento menzognero a `customer-order-form.component.ts:5126-5127`: dichiara il comportamento vecchio                  |
| §13.3 — La scelta di Listino si persiste?                           | ⏸ DECISIONE MANCANTE | Il codice ha deciso (nessuna colonna, nessuna chiave nel payload) e §13 tace                                                                                                                                                                                                           | `customer-order-form.component.ts:1745-1751`                                                                                          | ⛔ **Correzione di fatto:** la duplicazione **non** eredita `pricesIncludeVat` — il DTO di `duplicate` non lo contiene, quindi il duplicato di un ordine ivato **nasce netto**          | Chi riapre non sa con quale listino l'ordine è stato compilato                                                            |
| §13.1 — Prezzo/SKU/descrizione snapshot                             | ✅ CONFORME          | Pass-through nei tre punti; la variante è letta solo per validare                                                                                                                                                                                                                      | `customer-order-form.component.ts:4676-4695` · `manual-sales-order.util.ts:176-178`                                                   | ⚠️ Protezione per **assenza di riderivazione**, non per contratto                                                                                                                       | —                                                                                                                         |
| §13.1 — IVA snapshot                                                | ✅ CONFORME          | Contratto binario chiuso su entrambi i lati; il lato server mancava fino al 23/08/2026                                                                                                                                                                                                 | `manual-sales-order.util.ts:156-170` · `document-line-vat-payload.util.ts:57-67`                                                      | —                                                                                                                                                                                       | —                                                                                                                         |
| §13.1 — Etichetta variante snapshot                                 | ✅ CONFORME          | Persistito solo a parità di variante; il client non manda `variantLabel`                                                                                                                                                                                                               | `manual-sales-orders.service.ts:263-285`                                                                                              | —                                                                                                                                                                                       | —                                                                                                                         |
| §13.3 · OC-MAN-026 — Cambio Listino sostituisce i prezzi            | ✅ CONFORME          | Un solo chiamante, nessun `effect` sul listino, nessun riprezzamento alla riapertura                                                                                                                                                                                                   | `customer-order-form.component.ts:3348-3390`                                                                                          | ⚠️ Difetto nuovo trovato in falsificazione: non chiama `rememberLineNet` — vedi §3.14                                                                                                   | —                                                                                                                         |
| §13.2 · OC-MAN-027 — Contratto netto/ivato                          | ✅ CONFORME          | Colonna dedicata; modalità dell'ordine letta **prima** del patch righe; giro 2500 → 2049,1803 → 2500 verificato a mano                                                                                                                                                                 | `schema.prisma` `SalesOrder.pricesIncludeVat` · `customer-order-form.component.ts:4638-4641`                                          | —                                                                                                                                                                                       | —                                                                                                                         |
| §13.2 — Default aziendale                                           | ✅ CONFORME          | `customer_order` dentro `SALES_PRICE_MODE_TYPES`; l'endpoint della preferenza è su `users/me`, **senza** `@RequirePermissions`                                                                                                                                                         | `document-price-mode.util.ts:47-49` · `user-preferences.controller.ts:28-51`                                                          | —                                                                                                                                                                                       | ⭐ Contrasto col Listino: lo stesso dato funziona per tutti i ruoli su `users/me` e sparisce su `tenant/feature-settings` |
| §17.1 · OC-MAN-030 — Solo ordini MANUAL, garanzia sull'API          | ✅ CONFORME          | `source: manual` forzato in `headerData`; rifiuto sulla riga letta dentro la transazione; nessun secondo endpoint di scrittura                                                                                                                                                         | `manual-sales-orders.service.ts:336-340`, `:411`                                                                                      | —                                                                                                                                                                                       | —                                                                                                                         |
| §17.2 — Ordini Shopify read-only                                    | ✅ CONFORME          | I tre comandi ricontrollano l'origine; l'eccezione `channelMissingSince` è deliberata e argomentata                                                                                                                                                                                    | `manual-sales-orders.service.ts:676`, `:773`, `:846`                                                                                  | —                                                                                                                                                                                       | —                                                                                                                         |
| §17.2 — Apertura read-only non aggirabile                           | ✅ CONFORME          | La sola lettura è proprietà dell'**ordine caricato**, non della rotta                                                                                                                                                                                                                  | `customer-order-form.component.ts:1123-1127`, `:1307-1310`                                                                            | —                                                                                                                                                                                       | —                                                                                                                         |
| §17.3 — Nessun riferimento Shopify nella maschera                   | ✅ CONFORME          | Una sola occorrenza nel template, in un commento; verificato anche il pannello anagrafica incorporato, che gatea                                                                                                                                                                       | `product-form.component.ts:309-316`                                                                                                   | ⚠️ Conforme per **assenza di campi**, non per un gate: il primo campo di canale non troverebbe nulla a fermarlo                                                                         | —                                                                                                                         |

---

## 3. Le divergenze, con la causa radice

Ordinate per gravità: prima ciò che l'operatore subisce.

---

### 3.1 ⛔ La copertura ridotta produce uno stato abolito, e un dialogo che la specifica non prevede

**Specifica** — §2.3, §7.4, §18.5, OC-MAN-020: se il documento conclusivo copre meno dell'ordine, l'operatore riceve un warning non bloccante; se procede, **l'ordine è comunque Concluso**. Non esiste `Parzialmente concluso`, non esiste `forceConclude` come workflow.

**Codice** — `api/src/documents/documents.service.ts:3493-3501`:

```ts
data: fullyCovered
  ? { fulfilledAt: new Date(), fulfillmentStatus: fulfilled }
  : { fulfillmentStatus: SalesOrderFulfillmentStatus.partially_fulfilled };
```

Nel ramo parziale `fulfilledAt` resta `null`. L'ordine appare «Parzialmente concluso» in quattro superfici (`sales-order.model.ts:222`; badge `customer-order-form.component.html:32`; colonna `sales-order-table.component.ts:150`; export `sales-order-list-export.util.ts:29`), e l'unica uscita ordinaria è un dialogo a **tre** pulsanti (`customer-order-form.component.html:1627-1637`), dove «No» salva lasciando l'ordine nello stato vietato (`.ts:4945-4949`).

**Causa radice** — Una sola `update` decide **due cose distinte**: l'etichetta di evasione (`fulfillmentStatus`) e lo **stato del documento** (`fulfilledAt`, l'unico campo da cui il derivatore ricava «Concluso»). Legandole entrambe a `fullyCovered`, la copertura quantitativa diventa giudice dello stato documentale, che §7.1 assegna al contratto del collegamento. `forceConclude` è la toppa costruita a valle: la sua guardia (`manual-sales-orders.service.ts:782-786`) rifiuta ogni ordine che non sia già `partially_fulfilled` — non può esistere senza questo difetto.

⚠️ **Precisazione:** le destinazioni che possono produrre lo stato parziale sono **due** — DDT vendita e Fattura accompagnatoria — non tre: `manual_unload` è in `DOCUMENT_STOCK_UNLOAD_TYPES` ma `syncIncludedSalesOrdersTx` rifiuta l'aggancio di ordini a quel tipo (`documents.service.ts:1409-1411`).

**Livello** — API + DB (persistenza) + UI (dialogo ed etichette).

**Infrastruttura esistente** — Il consumo degli impegni è **già** incondizionato e precede il calcolo (`documents.service.ts:3464-3478`): rendere `Concluso` incondizionato non introduce nessun secondo effetto quantitativo. È esattamente ciò che §7.4 anticipava.

**Rischio di regressione** — ⛔ L'enum Prisma `SalesOrderFulfillmentStatus.partially_fulfilled` **non va rimosso**: ha consumer Shopify vivi (`shopify-sync.service.ts:726-735`, `online-order-lifecycle.service.ts:207-220`). Gli ordini già `partially_fulfilled` in database restano tali finché qualcosa non li tocca. `reopenLinkedManualOrderTx` li ripesca con `OR: [{fulfilledAt: {not: null}}, {fulfillmentStatus: partially_fulfilled}]` (`:3521-3531`): toccando la conclusione senza quel ramo, gli storici non verrebbero più riaperti e i loro impegni consumati resterebbero consumati. Infine `isSettled` (`manual-sales-orders.service.ts:351-353`) perderebbe uno dei due predicati.

**Test che oggi fallirebbe** — Ordine Confermato con riga da 5 pezzi; DDT vendita collegato con 3 pezzi; conferma. Atteso: `fulfilledAt != null`, `fulfillmentStatus = fulfilled`, nessun dialogo, nessuna chiamata a `/force-conclude`. Oggi: `fulfilledAt = null`, `partially_fulfilled`, dialogo a tre vie.

---

### 3.2 ⛔ Concludendo con Fattura accompagnatoria e poi annullandola, l'ordine resta orfano — e ricompare fra gli includibili

**Specifica** — §7.6: la riapertura del documento successivo riporta l'ordine in includibilità. §18.2: `Concluso` non è eleggibile come sorgente, e la garanzia deve valere su UI, API **e transazione server**.

**Codice** — `api/src/documents/documents.service.ts:2769-2773`:

```ts
const wasStockUnloaded =
  doc.status !== DocumentStatus.draft &&
  doc.type === DocumentType.sales_ddt && // ⛔ tipo cablato
  doc.onlineSaleId == null &&
  doc.locationId != null;
```

La riapertura sta sotto quel flag (`:3013-3016`), ma lo **sgancio è incondizionato**: `updateMany({ where: { tenantId, documentId: doc.id }, data: { documentId: null } })` (`:3022-3025`). La conferma invece usa il predicato per tipo, che include `invoice_accompanying` (`:2580-2583` con `document-stock.constants.ts:23-27`).

⭐ La catena UI è completa e verificata: `customer-order-form.component.ts:5564-5565` → rotta `/app/documents/fattura-accompagnatoria/new` → `sales-document-form.component.ts:3098-3113` `prefillFromIncludedOrderIfRequested` → `:3187` → `:2738-2739` `includedSalesOrderIds` nel payload. **Lo stato orfano è raggiungibile dalla normale interfaccia.**

Da lì l'ordine ha `fulfilledAt` valorizzato e `documentId = null`. Il filtro `includable` non guarda `fulfilledAt` (`sales-order-query.util.ts:80-86`), e la transazione di aggancio non lo seleziona nemmeno (`documents.service.ts:1432-1441`): l'ordine ricompare nel pannello Includi ed è agganciabile. Il secondo documento scarica di nuovo la merce, mentre `concludeLinkedManualOrderTx` lo salta (la sua query filtra `fulfilledAt: null`, `:3413`).

**Causa radice** — Due decisioni diverse governate da un solo flag: «va stornato il magazzino» e «va riaperto l'ordine». Il flag è tarato sulla prima, per il solo `sales_ddt`. A valle, l'eleggibilità è misurata sul **collegamento** invece che sullo **stato**, scelta dichiarata in due commenti gemelli; coincide con §18.2 solo finché regge l'invariante «Concluso ⟹ documentId valorizzato», che nessuna guardia impone.

**Livello** — API + DB.

**Infrastruttura esistente** — `reopenManualOrderRecordTx` (`documents.service.ts:3546-3600`) fa già tutto: azzera `fulfilledAt`, riporta `unfulfilled`, ripristina gli impegni consumati. Manca solo che venga invocata anche per l'accompagnatoria. ⚠️ Ha però due uscite a vuoto (ordine senza sede `:3559-3562`, ordine annullato `:3556`) mentre lo sgancio avviene comunque: va verificata, non data per funzionante.

**Rischio di regressione** — Estendere `wasStockUnloaded` all'accompagnatoria significa anche stornarne i movimenti: giusto quando ha scaricato, sbagliato se un DDT era già agganciato. La condizione corretta è `invoiceAccompanyingUnloadsStock` (`document-stock.constants.ts:52-54`), da tenere **distinta** dalla riapertura dell'ordine, che deve avvenire in ogni caso. Sul lato eleggibilità: stringere il filtro **senza** ripristinare la riapertura renderebbe gli ordini già orfani definitivamente inutilizzabili — non includibili e non concludibili, perché `concludePrefill` rifiuta `fulfilledAt` (`manual-sales-orders.service.ts:682-683`).

**Test che oggi fallirebbe** — (a) Ordine Confermato → «Concludi ordine» → Fattura accompagnatoria (senza DDT) → salva → annulla la fattura. Atteso: ordine di nuovo Confermato, impegni ricreati. Oggi: `fulfilledAt` ancora valorizzato, impegni `consumed`, `documentId = null`. (b) Con un ordine `fulfilledAt != null, documentId = null`: `GET /sales-orders?includable=true` non deve elencarlo; `POST /documents` con quell'id → 422. Oggi lo elenca e risponde 201.

---

### 3.3 ⛔ Su mobile si aggirano Cliente e Location, e le righe entrano senza vedersi

**Specifica** — §10.1, OC-MAN-025: finché mancano Cliente e Location la sezione righe resta non operativa; **ricerca e scansione non devono creare righe aggirando il gate**.

**Codice** — `src/app/features/sales-orders/customer-order-form.component.ts:4363-4366`:

```ts
protected openIncludePanel(): void {
  this.includeLaunchSeq.update((seq) => seq + 1);
  this.includePanelOpen.set(true);
}
```

Nessun `headerGateActive()`, nessun `formReadOnly()` — a differenza dei due gemelli `openProductPicker` (`:1605`) e `openScanOverlay` (`:1629`), che iniziano entrambi con `if (this.formReadOnly() || this.headerGateActive()) { return; }`.

Il pulsante che lo chiama, **in vesta compatta**, sta nel piede del pannello di testata (`.html:552-561`), che chiude a `:564`; il `<fieldset [disabled]="headerGateActive()">` apre a `:591`. Il pulsante gli è **fratello, non discendente**. La copia da scrivania (`:626`) sta invece dentro il fieldset ed è correttamente disabilitata. Il piede è proiettato solo nel ramo `@if (compatto())` (`document-header.component.ts:70-88`).

`onDocumentIncluded` (`:4379-4460`) costruisce i `FormGroup` e li inserisce con `this.lines.insert(...)` senza alcun controllo. Le righe così inserite restano **invisibili**: tabella e card sono nascoste dal gate (`.html:835`, `:920-926`).

**Causa radice** — Il gate è applicato in due modi diversi: come guardia nei gestori (due su tre) e come `disabled` sul contenitore (che copre solo la vesta desktop). Il terzo gestore non ha la guardia, e la sua veste mobile è fuori dal contenitore.

**Livello** — UI (solo mobile).

**Infrastruttura esistente** — La guardia da replicare è letteralmente la riga già presente negli altri due gestori.

**Rischio di regressione** — Basso. Va verificato che il pulsante nel piede non serva anche a documenti che il gate non governa (`isManualUnload` controlla solo `locationId`, `:1073`).

**Test che oggi fallirebbe** — Componente in vesta compatta, ordine nuovo senza Cliente: invocare `openIncludePanel()`; atteso `includePanelOpen()` falso. Oggi è vero, e da lì `onDocumentIncluded` popola `this.lines`.

---

### 3.4 ⛔ Il Listino non esiste per manager e commesso

**Specifica** — §13.3: il Listino è selezionabile in testata.

**Codice** — catena verificata anello per anello:

1. `customer-order-form.component.ts:1774` — `showListinoSelect = computed(() => this.listinoOptions().length > 1)`, gate secco nel template (`.html:470`).
2. `:1752` — `listinoOptions = computed(() => listinoSelectOptions(this.tenantSettings()))`; con `settings = null` resta una sola opzione (`product-listino.model.ts:56-61`).
3. `:881-884` — `toSignal(this.tenantFeatureSettingsService.getSettings().pipe(catchError(() => of(null))), …)`.
4. `api/src/tenant/tenant-company.controller.ts:34-38` — `@Get('feature-settings')` con `@RequirePermissions(TenantPermission.SettingsCompany)`; il guard lancia davvero (`tenant-permissions.guard.ts:79-88`), unico bypass la sessione di assistenza (`:55-57`).
5. `api/src/auth/tenant-permission.constants.ts:307-334` — `MANAGER_DEFAULTS` e `CLERK_DEFAULTS` includono `...ALL_DOC_MANAGE` (quindi `sales_order`) e **non** `SettingsCompany`.

**Causa radice** — Un dato di configurazione **operativa** (quali listini sono attivi, come si chiamano) viaggia su un endpoint di **amministrazione**. Il 403 è assorbito da `catchError(() => of(null))`: nessun errore, nessun banner, nessun log — il campo semplicemente non si disegna. È la stessa forma già registrata in `regole-gestionale` per `manualUnloadEnabled`.

⭐ **Il contrasto interno al codice è il dato più utile:** lo stesso identico problema è già risolto per il netto/ivato, portando il dato su `users/me` senza `@RequirePermissions` (`user-preferences.controller.ts:28-51`), con un commento che spiega proprio perché.

**Livello** — UI + API.

**Infrastruttura esistente** — Il precedente `users/me` sopra, e il precedente `manualUnloadEnabled` sul profilo utente descritto in `regole-gestionale`.

**Rischio di regressione** — ⛔ Aprire `GET /tenant/feature-settings` a tutti esporrebbe anche `salesPricesIncludeVat`, `defaultVatCodeId`, i dati societari. Il precedente scelto nel progetto è portare il singolo dato operativo sul profilo. Va deciso insieme se anche `defaultVatCodeId` (letto dalla stessa sorgente, `customer-order-form.component.ts:903`) abbia lo stesso problema.

⚠️ I preset di ruolo sono il punto di partenza materializzato al salvataggio, non un fallback: un titolare può aver concesso `settings.company` a un manager. La misura vale per la configurazione predefinita.

**Test che oggi fallirebbe** — Componente: montare la maschera con un utente senza `settings.company` e un tenant con Listino 1 attivo; asserire che `app-document-listino-select` sia nel DOM.

---

### 3.5 ⛔ Una ricerca abbandonata diventa una riga d'ordine

**Specifica** — §11.1, OC-MAN-024: una riga vuota o una **query di ricerca** non è una riga documento; la persistenza deve distinguere riga esistente, nuova, eliminata e **tecnica di ricerca**.

**Codice** — `customer-order-form.component.ts:3755-3761`:

```ts
protected onLineProductNameChange(index: number, value: string): void {
  const line = this.lines.at(index);
  line.controls.productName.setValue(value);   // dato della riga
  this.productSuggest.focusLine(index);
  this.variantSearchDraft.set(value);          // ricerca
```

Da lì `lineIsEmpty` (`:2651-2656`) è falso, la quantità di default è 1 (`:2206-2208`), il payload la include (`:4982-4993`) e il server l'accetta: `isPersistableManualOrderLine` richiede `hasProduct && quantity > 0`, dove `hasProduct = Boolean(variantId) || Boolean(title?.trim())` (`manual-sales-order.util.ts:246-249`). Il rifiuto per righe incomplete è nel ramo `isRegistryDocument` (`:499`, `:4754`), che esclude l'Ordine cliente.

**Causa radice** — Il campo `productName` ha due mestieri: query dell'autocomplete e titolo snapshot della riga. Nessuno dei due livelli può distinguerli. A valle, `isPersistableManualOrderLine` accetta **apposta** la riga senza variante (righe descrittive, servizi non catalogati): quel permesso legittimo lascia passare anche la query abbandonata. Manca il terzo stato che la specifica nomina.

**Livello** — UI + API.

**Rischio di regressione** — ⛔ Rifiutare le righe senza `variantId` è la correzione **sbagliata**: romperebbe righe descrittive, servizi e la riga `isReference`. Serve una marcatura esplicita o un campo di query separato — ed è una decisione di prodotto. Va verificato l'effetto sulla duplicazione (`manual-sales-orders.service.ts:913-928`).

**Test che oggi fallirebbe** — Componente: Cliente e Location compilati, digitare «magli» senza scegliere un suggerimento, Salva. Atteso: payload con `lines: []`. Oggi contiene `{ title: 'magli', quantity: 1 }`.

---

### 3.6 ⛔ Su un ordine Concluso la spunta «Impegna magazzino» è cliccabile e non comanda nulla

**Specifica** — §9.2 riga 470, marcata ⛔: «Non è ammesso lasciare in `Concluso` una checkbox apparentemente operativa che non comanda alcun effetto». **Non deliberato è quale rimedio adottare** (nascosta / storica read-only), non il divieto.

**Codice** — tre gambe:

- **Visibile**: `isLineColumnVisible` non guarda lo stato (`customer-order-form.component.ts:2128-2158`).
- **Operabile**: `canUnlockDocument = computed(() => this.canManageOrders() && !this.isExternalOrder())` (`:1284-1286`) non esclude il concluso; sbloccato, il `<fieldset [disabled]="formReadOnly()">` (`.html:224`) si riapre.
- **Inerte**: `if (isSettled) { /* Nessuna variazione impegni */ }` (`manual-sales-orders.service.ts:499-500`).

§7.5 conferma che modificare un ordine Concluso è previsto: il caso non è teorico.

**Causa radice** — Visibilità ed editabilità sono decise a livello di maschera senza conoscere lo stato; l'inefficacia è decisa nel servizio. I due piani non si parlano: il server sa che la spunta non comanda niente, il client non lo dice.

**Prova a contrario, nella stessa maschera:** il selettore di **Stato** in testata sa già degradare a sola lettura sul concluso (`.html:396-397`). La colonna no.

**Livello** — UI + API.

**Rischio di regressione** — Se si scegliesse «storica read-only», attenzione al vincolo già noto: `.html:735-736` («Il riordino va disabilitato a mano: il `<fieldset disabled>`…»). Se «nascosta», il predicato è **condiviso** con il calcolo delle larghezze (`:2172-2177`), e il commento a `:2129-2142` racconta il difetto già pagato una volta (somma larghezze 116,84%).

**Test che oggi fallirebbe** — Da scrivere **dopo** la delibera; entrambe le varianti oggi falliscono.

---

### 3.7 ⛔ L'eliminazione di un ordine cancella l'unico legame col documento emesso

**Specifica** — §15.2, terzo punto (regola minima **inderogabile**, indipendente dalla policy §15.3): l'eliminazione non deve perdere la tracciabilità di un documento successivo già emesso.

**Codice** — Il collegamento vive in un solo posto: `SalesOrder.documentId` (`schema.prisma:1358`, relazione `onDelete: SetNull`). Il documento non ha colonna propria: la sua vista è la relazione inversa (`documents.service.ts:1420-1423`, esposta come `linkedSalesOrders` a `:917`). `delete()` non carica `documentId` nella `select` (`manual-sales-orders.service.ts:824-834`) e chiude con `tx.salesOrder.delete` (`:872`). Le cascate portano via anche `StockReservation` e `StockReservationEvent` (`schema.prisma:1609`, `:1635`). Del rapporto sopravvive solo la riga di **testo** «Rif. Ordine cliente N. …» (`sales-document-form.component.ts:3227-3246`).

**Causa radice** — La relazione è materializzata come colonna sul **figlio**: cancellare il figlio è cancellare il legame. E `delete()` non interroga `documentId`, quindi non ha nemmeno l'informazione per rifiutare o avvisare. Il `SetNull` protegge la direzione opposta.

⭐ **Asimmetria misurata:** la direzione opposta è protetta con cura — un DDT confermato non si elimina affatto (`documents.service.ts:3084-3095`), e annullandolo il codice riapre gli ordini, ripristina gli impegni e azzera i puntatori. Il progetto sa che quel legame va governato: lo governa in un verso solo.

**Livello** — API + DB.

**Rischio di regressione** — Una guardia `if (order.documentId) throw` renderebbe ineliminabili tre categorie che oggi si eliminano: (a) ordini agganciati a un documento poi **annullato** (`documents.service.ts:1499-1506` lo tratta come riagganciabile); (b) ordini di canale con `channelMissingSince`; (c) ordini agganciati e poi sganciati male. La guardia va sull'**API**: `DELETE /sales-orders/manual/:id` è raggiungibile direttamente. Se si scegliesse di **conservare** il legame invece di vietare, servirebbe una migration.

**Test che oggi fallirebbe** — Ordine manuale → documento conclusivo salvato (`documentId` valorizzato, `linkedSalesOrders.length === 1`) → `manualOrders.delete(...)` → rileggere il documento. Oggi: 204 e `linkedSalesOrders: []`. Caso simmetrico da tenere verde: ordine agganciato a documento **annullato**, l'eliminazione continua a riuscire.

---

### 3.8 ⛔ Un tenant senza Shopify vede due voci Shopify nel filtro Origine

**Specifica** — §17.3, OC-MAN-028: nessun campo, filtro, badge, banner, indicatore o colonna Shopify.

**Codice** — `sales-order-list.component.ts:243-256`: il ramo del registro generale ritorna **incondizionatamente** `[{manual, 'Manuale'}, {online, 'Shopify online'}, {pos, 'Shopify POS'}]`. Reso senza `@if` in entrambe le vesti (`.html:166-176`, `:389-398`). `grep -rn "tenantChannelProfile|showShopifyIntegration" src/app/features/sales-orders/ src/app/domain/sales-orders/` → solo file `.spec`.

**Causa radice** — L'elenco distingue le due **viste** (`isShopifyView`, da `routeData.salesListProfile`) ma non il **profilo canale** del tenant. Sono due domande diverse, e §17.3 riguarda la seconda.

⚠️ Da distinguere: la **colonna** «Origine» non è un difetto — le sue etichette sono neutre («Online», «Negozio», «Manuale», `sales-order-labels.util.ts:41-45`). Ma `{ id: 'onlineSale', label: 'Vendita online' }` sta nel selettore Colonne del registro generale (`sales-order-list-columns.config.ts:40-56`), ed è una nozione di canale.

**Livello** — UI.

**Infrastruttura esistente** — `showShopifyIntegration(profile)` (`tenant-channel-profile.model.ts:59-61`), già usata in `product-list.component.ts:195` e `inventory-levels.component.ts:197`; **precedente esatto per le colonne** a `product-list.component.ts:316-322`, col commento «Senza il canale Shopify la colonna non entra nel SELETTORE».

**Rischio di regressione** — Il filtro ha stato in query param: togliere le opzioni non basta, un URL con `?source=online` resterebbe applicato mostrando un elenco vuoto. Va normalizzato il valore in arrivo. Attenzione a non spegnere la vista `shopify-orders`, che ha il ramo suo (`:245-250`).

**Test che oggi fallirebbe** — Montare l'elenco con profilo `customer-orders` e `tenantChannelProfile: 'gestionale'`; asserire che `sourceOptions()` non contenga voci «Shopify» e che il DOM non contenga la stringa.

---

### 3.9 ⛔ Sei rotte allegati e una rotta impegni leggono ordini di sedi non proprie

**Specifica** — §10.4, §15.2: tenant e autorizzazioni verificati **lato API** su ogni accesso.

**Codice** — `api/src/sales-orders/sales-orders.controller.ts:127-134`: `listManualReservations(@CurrentTenant() tenantId, @Param('id') id)` — nessun `@CurrentUser()`; il servizio non può verificare (`manual-sales-orders.service.ts:116-127`).

⭐ **Estensione:** sullo stesso controller **sei rotte allegati** accedono a un Ordine per id
senza alcun controllo di sede — `:190` list, `:196` upload, `:209` quota, `:216` download,
`:231` rename, `:242` delete — perché `attachments.service.ts` risolve l'entità con
`assertEntity` (`:230-254`), che filtra **solo per `tenantId`**.

⚠️ **Correzione di prova, 28/08/2026 (verifica del revisore):** la stesura originale diceva che
tutte e sei fossero «senza `@CurrentUser()`». Non è esatto: **`:196` upload lo riceve**, ma lo usa
soltanto per `user.displayName` nella traccia di audit, non per autorizzare. Censite le 17 rotte del
controller, quelle **prive** di `@CurrentUser()` sono **sette**: `manual/meta` (:106),
`manual/:id/reservations` (:127) e cinque delle sei rotte allegati. Il difetto sostanziale resta
identico su tutte e sei — cambia il meccanismo, non l'esito: **nessuna verifica la sede dell'ordine**.

Per contrasto, `getById` (`:270-278`) passa `@CurrentUser()` e `sales-orders.service.ts:197-203`
asserisce davvero; `exportPdf` (`:254-268`) è protetta perché passa da `getById`.

**Causa radice** — Le rotte sono nate come supporto interno alla maschera, dove ci si arriva da `getById`, che il controllo l'ha già fatto. Ma sono pubbliche quanto le altre e non sanno da dove le si chiama: `SALES_ORDERS_MANAGE_PERMISSIONS` dice **cosa** l'utente può fare, non su **quale sede**. È lo stesso difetto già chiuso su `listActiveForLevel`.

**Livello** — API.

**Infrastruttura esistente** — `assertLocationReadableInUserScope`, con cinque test in `stock-reservation.service.spec.ts:32-100`.

**Rischio di regressione** — L'assert va sulla sede dell'**ordine**, quindi serve leggerla (una query in più). Va scelto se rispondere 403 o array vuoto: la maschera usa il risultato per un calcolo, e un errore non gestito lascerebbe la colonna disponibilità vuota senza spiegazione. Il predicato corretto è quello di **lettura**, per non rompere chi ha `inventory.view_all_locations`.

**Test che oggi fallirebbe** — Commesso su `loc-1`, ordine su `loc-2` con impegno attivo: `GET /sales-orders/manual/:id/reservations` → atteso `ForbiddenException`. Oggi 200. Ripetere per il download allegato.

---

### 3.10 ⛔ L'intento «Impegna magazzino» si deriva dalla presenza di una variante, e finisce in un movimento fisico

**Specifica** — §9.4 con §9.3 e §18.3: servizi e righe non movimentabili non producono Impegnata; l'intento non si deriva da «ha una variante» ma dall'eleggibilità a magazzino.

**Codice** — `customer-order-form.component.ts:4453`, dentro `onDocumentIncluded`: `commitsStock: Boolean(line.variantId),`. Nessuna correzione a valle: `refreshAllLineSummaries` (`:3061-3088`) scrive solo `articleCode`. Il payload d'inclusione non trasporta l'intento della sorgente (`document-include.util.ts:211-259`). Il percorso è raggiungibile: `CUSTOMER_ORDER_INCLUDE_SOURCES = [IncludeSourceKind.Quote]` (`:59-61`).

⭐ **Amplificazione:** l'intento sbagliato **non resta nell'ordine**. Il server lo propaga al documento di scarico generato: `manual-sales-orders.service.ts:746` → `loadsStock: line.commitsStock && Boolean(line.variantId)`. Da impegno diventa **movimento fisico**.

⚠️ Il secondo percorso citato nel censimento (`:2093`) **non riguarda l'Ordine cliente**: `prefillFromConversionDocument` esce con `if (!fromDocument || !this.isSalesDdt) return` (`:2025-2029`).

**Causa radice** — La regola di eleggibilità è centralizzata nel risolutore (`document-line-article-resolver.util.ts:89-92`: `!servizio && !nonGestito`), ma il percorso di prefill non ci passa: costruisce i gruppi con `patchValue` diretti. Finché la barriera server coprisse il caso, l'errore resterebbe nel client — ma la barriera server **non lo copre** (vedi §3.11), quindi arriva al database.

**Livello** — UI, con conseguenza API + DB.

**Rischio di regressione** — L'eleggibilità non è nel payload d'inclusione: risolverla richiede o di aggiungerla al payload, o una lettura asincrona dopo il prefill — e in quel caso la spunta cambierebbe **dopo** che l'operatore ha visto la riga, che è a sua volta un comportamento da decidere.

**Test che oggi fallirebbe** — Chiamare `onDocumentIncluded` in modalità Ordine cliente con una riga di un articolo `kind = 'service'`. Atteso `commitsStock === false`. Oggi `true`.

---

### 3.11 ⚠️ `effectiveCommits` legge `kind` dal database e non lo usa mai

**Specifica** — §5.2 riga 275: servizi e articoli non gestiti non devono creare Impegnata **«anche se il dato UI fosse valorizzato erroneamente»**. OC-MAN-009 è incondizionato.

**Codice** — `manual-sales-orders.service.ts:302-308`:

```ts
const effectiveCommits = (line) => {
  if (!line.commitsStock || !line.variantId || line.quantity <= 0) return false;
  const variant = variantById.get(line.variantId);
  return variant?.product.managesStock !== false; // ⛔ `kind` mai letto
};
```

La query **seleziona** `kind` (`:183`) e `grep -n "kind"` sul file restituisce solo quella riga. La definizione canonica è `!servizio && !nonGestito` (`document-line-article-resolver.util.ts:89-92`), con test dedicato («un Servizio resta escluso anche con managesStock true»).

**Raggiungibilità verificata:** `managesStock Boolean @default(true)` e `kind ProductKind @default(article)` sono colonne indipendenti (`schema.prisma:744`, `:748`); la creazione API applica `dto.managesStock ?? true` senza accoppiamento (`products.service.ts:564`); la maschera prodotto si limita a **proporre** la spunta giù, e lo dichiara nel commento (`product-general-step.component.ts:820-838`).

**Causa radice** — Il predicato server esprime la non-eleggibilità con **uno solo dei due criteri** che la definiscono. Il difetto è mascherato dal client, che imposta la spunta a OFF; la protezione cade appena la spunta arriva accesa — dall'operatore che la riattiva o dal prefill di §3.10.

**Livello** — API. Lo stesso buco è replicato nella riapertura (`documents.service.ts:3586-3610`).

**Rischio di regressione** — Aggiungere `kind` cambia il comportamento anche al **risalvataggio** di ordini esistenti: gli impegni oggi attivi su articoli-servizio verrebbero rilasciati al primo salvataggio, spostando la Disponibile.

**Test che oggi fallirebbe** — Ordine Confermato con riga di variante `kind = 'service'`, `managesStock = true`, `commitsStock: true`. Atteso: nessuna reservation, salvataggio riuscito. Oggi nasce una reservation attiva e il valore va anche ai canali.

---

### 3.12 ⚠️ Il warning di disponibilità mente quando lo stesso articolo sta su due righe

**Specifica** — §3.2, OC-MAN-007: warning **visibile** che dica «richiesti N, disponibili solo M».

**Codice** — `manual-sales-orders.service.ts:531-557`: `requestedByVariant` aggrega per **variante**, `residual = Math.max(0, requested + available)`, ma il messaggio stampa `line.quantity`, che è per **riga**. Giacenza 5, due righe da 4: `committed = 8`, `available = -3`, `residual = max(0, 8-3) = 5` → **«richiesti 4, disponibili solo 5»**.

Lato client il confronto è per riga (`lineExceedsAvailability`, `:3133-3148`), quindi `collectAvailabilityIssues()` è vuoto e **il dialogo non si apre**.

⭐ Il falsificatore ha aggravato: tace anche l'**avviso ambra sulla cella** dopo il salvataggio, perché `lineEffectiveAvailable` (`:3117-3123`) riaggiunge l'impegno proprio dell'ordine (−3 + 8 = 5). Nessuno dei due presidi si accende, né prima né dopo.

**Causa radice** — Due granularità mescolate nello stesso messaggio: `requested` per variante, `line.quantity` per riga. Finché coincidono — una riga per variante — il testo torna. La formula in sé è corretta (`requested + available` è la disponibilità pre-ordine): è l'**accostamento** a mentire. Lato client il difetto è speculare: il confronto per riga non conosce le altre righe della stessa variante.

**Livello** — API (testo) + UI (rilevazione). Nessun impatto sul DB: la Impegnata calcolata è corretta.

**Rischio di regressione** — Il testo condiviso vive in `variant-availability.util.ts:35-37` ed è usato da quattro maschere (Ordine, DDT vendita, Vendita manuale, Fattura accompagnatoria). La correzione va nell'utility, non nell'Ordine, o si torna alle tre implementazioni divergenti che quel file documenta di aver appena unificato.

**Test che oggi fallirebbe** — API: due righe da 4 della stessa variante, `onHand = 5`; asserire che ogni messaggio contenga un residuo **minore** della quantità della propria riga. UI: asserire che `collectAvailabilityIssues()` non sia vuoto e che il dialogo si apra.

---

### 3.13 ⚠️ Modificare l'articolo dal pannello riscrive una riga d'ordine già salvata

**Specifica** — §13.1: le modifiche all'anagrafica non riscrivono l'ordine storico. §9.3: l'intento di riga si conserva.

**Codice** — `customer-order-form.component.ts:4243-4250` `onProductUpdatedFromPanel` → `pinVariantSummary(lineIndex, variantId)` **senza il quarto argomento**, quindi `replacedArticle = false` (`:3031-3036`) → `applySummaryToLine` (`:3051`) → `scrivi` (`:2925-2933`), che scrive appena il valore non è `undefined`.

Campi riscritti e poi **persistiti**: `sku`, `barcode`, `productName`, `unitOfMeasure` (`:2933-2946`), **`commitsStock`** (`:2953-2956`, incondizionato) ed eventualmente lo **sconto**. Solo il **prezzo** è protetto (`:2980-2984`, scrive solo se vuoto).

⚠️ **Correzione al censimento:** `variantLabel` è riscritto sul client ma **non entra nel payload**, e il server conserva il persistito a parità di variante — va tolto dall'elenco dei danni salvati.

**Causa radice** — Il difetto è nel default del parametro. `applySummaryToLine` documenta due gesti opposti («riga nuova: si riempie ciò che è vuoto» / «articolo sostituito: si riscrive»), ma la prima metà è mantenuta **solo per il prezzo**: la selettività è scritta a mano campo per campo e i campi identità non l'hanno. `onProductUpdatedFromPanel` riusa il canale del **richiamo articolo** per un gesto che richiamo non è.

⚠️ La riscrittura di `commitsStock` pesa più dei campi descrittivi: tocca §9.3 e le reservation — una riga su cui l'operatore aveva tolto «Impegna magazzino» se la ritrova spuntata.

**Livello** — UI.

**Rischio di regressione** — ⛔ Non si può semplicemente smettere di scrivere: chi corregge un refuso si aspetta che la riga in composizione lo mostri. Due forme a seconda della decisione: (a) non toccare le righe **persistite**, (b) toccarle e dirlo. ⛔ Toccare il **risolutore** è pericoloso: è condiviso da otto maschere e la semantica «il richiamo resetta» è contrattuale (`docs/03c`).

**Test che oggi fallirebbe** — Ordine salvato con riga persistita (`sku='A1'`, `productName='Maglia cotone'`); `onProductUpdatedFromPanel` con summary `sku='A2'`. Atteso: i controlli restano `A1` / `Maglia cotone`.

---

### 3.14 ⚠️ Il cambio Listino tace su righe che non riprezza, e perde il centesimo in modalità ivata

**Specifica** — §13.3, OC-MAN-026: al cambio Listino i prezzi delle righe esistenti sono sostituiti; le righe senza prezzo vanno segnalate.

**Codice, difetto A (silenzio)** — `customer-order-form.component.ts:3369` passa `variant: r.riprezzabile ? r.summary : null`; in `document-listino.util.ts:131-135`, `if (!line.variant) { prices.push(null); continue; }` — la riga **non entra in `missing`**. Al ritorno (`:3375-3377`) il campo non viene toccato.

⭐ **Finestra ordinaria, non caso limite:** `refreshAllLineSummaries` (`:3061-3088`) **azzera `pinnedVariants`** all'apertura di un ordine (`:3070`) e la ripopola con chiamate asincrone senza `catchError`. Chi apre un ordine e cambia Listino prima che le risposte arrivino non riprezza **nulla** e non riceve alcun avviso.

**Codice, difetto B (precisione)** — `applyListinoChoice` riscrive `unitPrice` (`:3378-3381`) **senza chiamare `rememberLineNet`**, che `setPriceMode` invece chiama (`:3313-3325`). In modalità **ivata** il netto poi salvato è lo scorporo del lordo **arrotondato a due decimali**: listino 33,33 € al 22% memorizza ~3332,79 invece di 3333.

**Causa radice** — (A) `variant: null` significa due cose — «riga senza articolo» (giusto tacere) e «articolo di cui non conosco i prezzi» (da segnalare) — e l'informazione si perde a monte, nella maschera. (B) Il campo prezzo ha un netto canonico memorizzato accanto al testo mostrato; scrivere il testo senza aggiornare il netto rompe l'invariante.

**Livello** — UI.

**Rischio di regressione** — `listinoRepricing` è condivisa con `sales-document-form.component.ts:389`: il cambio di firma va propagato, e le due maschere procurano i riepiloghi in modi diversi.

**Test che oggi fallirebbe** — (A) Due righe con `variantId`, riepilogo in memoria solo per la prima; `onListinoChoice(2)`: asserire che il prezzo della seconda **non** sia rimasto in silenzio e che `listinoWarnings()` la nomini. (B) Modalità ivata, listino 33,33 al 22%, `onListinoChoice`: asserire il netto memorizzato a 3333, non 3332,79.

---

### 3.15 ⚠️ La memoria netto/ivato dell'operatore non viene mai scritta, e il duplicato nasce netto

**Specifica** — §13.2 e il contratto comune: convenzione aziendale → **memoria dell'operatore** (scritta alla creazione, non in modifica) → modalità del documento.

**Codice, difetto A** — `grep -rn "\.remember(" api/src --include=*.ts | grep -v spec` → **due** chiamanti: `documents.service.ts:1232` e `store-sales.service.ts:147`. Nessuno è l'ordine. `ManualSalesOrdersService` non inietta nemmeno il servizio (costruttore `:95-102`). La **lettura** invece c'è ed è corretta (`document-price-mode.util.ts:47-49`).

**Codice, difetto B** — ⛔ Errore di fatto nel censimento, corretto dal falsificatore: la **duplicazione non eredita `pricesIncludeVat`**. Il DTO costruito da `duplicate` (`manual-sales-orders.service.ts:902-929`) elenca customerId, locationId, documentDate, externalRef, notes, internalComment, paymentTerms, documentDiscountPercent, lines — **non** `pricesIncludeVat`. Ricade quindi su `dto.pricesIncludeVat ?? false` (`:427`): **il duplicato di un ordine ivato nasce netto**. Per contrasto `concludePrefill` lo eredita (`:716-719`).

**Causa radice** — Il salvataggio dell'Ordine cliente non passa da `documents.service.ts`, dove la memorizzazione è agganciata a valle del commit. Quando l'Ordine ha ricevuto un tipo proprio per la modalità prezzo è stato allineato il lato **lettura** e non il lato **scrittura**: mezzo contratto. Il difetto è invisibile perché degrada su un valore sensato.

**Livello** — API.

**Rischio di regressione** — ⛔ `save` è un metodo unico per creazione e modifica (il ramo si distingue da `dto.id`): il gancio va messo **solo** sul ramo di creazione. Metterlo in fondo al metodo memorizzerebbe anche le modifiche, che il contratto vieta esplicitamente. Aggiungere la chiamata cambia inoltre il comportamento percepito: il nuovo ordine seguirebbe l'ultima scelta della persona invece della convenzione aziendale.

**Test che oggi fallirebbe** — (A) Con `salesPricesIncludeVat = false`, creare un ordine con `pricesIncludeVat: true`; poi `GET /users/me/document-price-mode/customer_order` → atteso `true`. Oggi `false`. Confine: risalvare con `false` e asserire che la preferenza resti `true`. (B) Duplicare un ordine con `pricesIncludeVat = true` → atteso `true` sul duplicato. Oggi `false`.

---

### 3.16 ⚠️ Il CSV chiamato «corrispettivi Shopify» contiene gli ordini manuali

**Specifica** — §20: l'elenco e il suo export rispondono agli stessi filtri.

**Codice** — Due scarti. (a) `sales-order-query.util.ts:49-53`: senza `source` il filtro origine **non viene aggiunto**, e nessuno dei due chiamanti lo passa (`sales-order-list.component.ts:825-835`, `reports.component.ts:249-253`, entrambi col solo periodo e nome file `corrispettivi-shopify`). (b) Il contratto diverge: `export-sales-orders.query.dto.ts:11` ammette due origini contro quattro, e non conosce `includable`, `missingOnChannel`, `sort`, `all`; con `whitelist: true, forbidNonWhitelisted: true` (`main.ts:57-58`) una richiesta che li porti dà **400**.

**Causa radice** — L'export nasce come export dei corrispettivi Shopify, non come export dell'elenco: la firma è generica ma il solo contratto previsto è «periodo». Il DTO ristretto a `online|pos` è il residuo di quell'intenzione, mentre il `where` non la impone.

**Livello** — API + UI.

**Rischio di regressione** — ⚠️ Aggiungere un filtro origine di default cambia il contenuto di un CSV che **potrebbe già essere usato in una procedura contabile**: va confermato col proprietario, non dedotto. Allineare i DTO è additivo, ma comporta decidere se l'export debba impaginare e ordinare.

⚠️ **Precisazione sullo scope sede:** elenco ed export condividono `where` e clausola di scope — ma quella conformità **poggia su lavoro non committato** (il `@CurrentUser()` sull'export). Su HEAD il CSV esce dal perimetro.

**Test che oggi fallirebbe** — Un ordine manuale e uno Shopify nello stesso periodo: `exportCsv({placedFrom, placedTo})` → oggi due righe.

---

### 3.17 ⚠️ Il primo Salva non chiede conferma — ed è un contrasto, non un arretrato

**Specifica** — §14.1: al primo Salva di un documento nuovo l'interfaccia chiede conferma («Sei sicuro di voler salvare il documento appena creato?», Sì / Annulla).

**Codice** — `grep -rn "appena creato|Sei sicuro di voler salvare" src/app api/src` → otto occorrenze, **tutte commenti**, fra cui `supplier-order-form.component.ts:2658` («Primo salvataggio: si RESTA nel documento appena creato»). I sei `app-confirm-dialog` della maschera sono altri (`.html:1699`, `:1764`, `:1773`, `:1783`, `:1793`, `:1807`). `requestSaveDocument` (`:4717-4720`) controlla solo `saving()`/`formReadOnly()`.

**Causa radice** — Non è una regressione: la maschera adotta la convenzione **opposta** — «si salva, il documento si blocca, si resta dentro» (`:5047-5050`, `editLock.relock(...)` a `:5077-5082`) — decisa nell'08/2026 e presente anche nell'Ordine fornitore. §14.1 chiede un passo che quella convenzione non prevede.

**Livello** — UI.

**Rischio di regressione** — ⛔ Il salvataggio ha **sei punti di ingresso**, dichiarati nel codice (`:5045-5047`). Metterlo a monte di uno solo lo renderebbe aggirabile dagli altri cinque; metterlo dentro `saveDocument` farebbe scattare due conferme di fila dopo il dialogo disponibilità. Va deciso se vale anche per Preventivo e DDT, che condividono la maschera.

⭐ **È da portare al proprietario come contrasto fra due decisioni, non come lavoro da fare:** una delle due deve cedere.

**Test che oggi fallirebbe** — `requestSaveDocument()` su ordine nuovo compilato: atteso che `saveManualOrder` non sia ancora stato chiamato e che sia aperto un dialogo.

---

### 3.18 ⚠️ Il primo salvataggio non ha chiave di idempotenza: una risposta persa crea due ordini

**Specifica** — §14.4: retry, doppio click o risposta persa non devono produrre due ordini, due set di reservation, doppie righe.

**Codice** — Protetto: il doppio clic in volo (`customer-order-form.component.ts:4717-4718`, `[busy]="saving()"`) e il risalvataggio di un ordine esistente (update per id, `salesOrderLineId @unique`, ramo `delta === 0`). **Non protetto:** `grep -rniE "idempotency|dedupeKey" api/src src/app` trova solo il ciclo online. `manual-sales-orders.service.ts:436-438` crea incondizionatamente quando `id` manca; l'id compare nel form solo **dopo** la risposta (`:5078-5082`).

⚠️ Verificato: non esiste un retry interceptor (`src/app/core/interceptors/` ha solo `error` e `loading`), quindi il retry è sempre un gesto dell'operatore. E il numero non è imposto dal client nel percorso normale (`:5018-5022`), quindi il secondo tentativo prende un numero **libero** e riesce.

**Causa radice** — L'unica chiave d'identità nasce sul **server** e torna nella risposta. Finché la risposta non arriva, il client non ha nulla da rimandare che dica «è lo stesso salvataggio»: la creazione è non idempotente per costruzione. Il lock del contatore serializza i numeri ma non riconosce il duplicato.

**Livello** — UI + API.

**Infrastruttura esistente** — ⭐ Il precedente è già nel progetto: `OnlineOrderEvent.dedupeKey` con `@@unique([tenantId, dedupeKey])` (`schema.prisma:1652-1659`).

**Rischio di regressione** — Una chiave su `sales_orders` richiede **migration su database condiviso** (SQL a mano, `prisma:deploy`, mai `migrate dev`). Attenzione a non riusare la chiave dopo un errore di validazione legittimo, o il secondo tentativo corretto verrebbe scambiato per retry.

**Test che oggi fallirebbe** — Due `save(tenantId, dto)` con lo **stesso** dto privo di `id`. Atteso un ordine e un set di impegni. Oggi due ordini e `committed` doppio.

---

### 3.19 ⚠️ Il server accetta transizioni di stato che la specifica non ammette

**Specifica** — §8.1: `Concluso → altri stati` non avviene via semplice selettore.

**Codice** — Le guardie di `save` sull'ordine esistente sono tre: esistenza, `source === manual`, scope sede (`manual-sales-orders.service.ts:327-345`). Nessuna legge `fulfilledAt`. Riga 405 scrive `cancelledAt = new Date()` senza condizioni, e `manualOrderState` valuta `cancelledAt` **prima** di `fulfilledAt` (`sales-order.model.ts:216-220`): un `POST manual/save` con `{id, status:'cancelled'}` su un ordine Concluso risponde 200 e lo mostra Annullato.

**Causa radice** — Il servizio tratta `status` come un **valore da scrivere**, non come una **transizione da validare**: non legge mai lo stato di partenza. Le uniche guardie di stato del servizio stanno negli altri due metodi (`concludePrefill` `:679-684`, `forceConclude` `:776-786`), non in quello che scrive lo stato.

**Livello** — API.

**Rischio di regressione** — La guardia deve vietare il **cambio di stato** su un ordine settled, non il salvataggio: §7.5 ammette esplicitamente che un Concluso «può essere modificato e salvato», e lo stesso `save` serve la duplicazione.

⭐ Va scritta **ora, in un punto solo**: la validazione delle transizioni di §8.1 servirà comunque quando gli stati verranno estesi.

**Test che oggi fallirebbe** — Ordine concluso da un documento di scarico; `POST manual/save` con `{id, status:'cancelled'}` → atteso 409. Oggi 200.

---

### 3.20 ⚠️ Il flag `commitsStock` si riaccende se il client smette di mandarlo

**Specifica** — §9.3: nascondere la colonna per stato non deve obbligare a distruggere i dati di riga.

**Codice** — `manual-sales-order.util.ts:187`: `commitsStock: line.commitsStock ?? true,`. Il DTO lo dichiara `@IsOptional()` (`:73-76`), quindi ometterlo è una richiesta valida. A **otto righe di distanza**, nello stesso file, il Codice IVA ha invece il contratto binario, col commento «⛔ Riga GIÀ ESISTENTE senza `vatCodeId`… QUI MANCAVA» (`:150-160`).

**Causa radice** — Il campo appartiene al gruppo «che il client manda sempre», e il ripiego `true` pensato per la riga **nuova** è applicato indistintamente anche alla riga **esistente**. Finché la colonna è sempre visibile la differenza non si vede; diventa un difetto **nel momento esatto** in cui §9.2 verrà implementato.

**Livello** — API + DB.

**Rischio di regressione** — Il ripiego `true` va **mantenuto** per la riga nuova e sostituito col persistito solo per la riga esistente — la stessa forma già usata per `vatCodeId`.

⛔ **Chi eseguirà §9.2 deve chiudere prima questa**, o il nascondimento della colonna produrrà la perdita di dati che §9.3 vieta.

**Test che oggi fallirebbe** — Riga persistita `commitsStock = false`; risalvare con lo stesso `line.id` e il campo **assente**. Atteso: resta `false`, nessuna reservation. Oggi torna `true`.

---

### 3.21 ⚠️ Includi e Genera hanno quattro matrici di coppia che non concordano

**Specifica** — §18.1, §18.2: una sola infrastruttura con policy per coppia; la regola garantita su UI e API allo stesso modo.

**Codice** — Quattro fonti:

1. `manual-sales-orders.service.ts:111-113` — `getMeta()` propone **tre** destinazioni (`DOCUMENT_STOCK_UNLOAD_TYPES`, con `manual_unload`).
2. `:655-659` — `concludePrefill` accetta ogni tipo di quell'elenco (guardia a `:665-667` solo se la Vendita manuale è **spenta**).
3. `documents.service.ts:1409-1418` — `canAttachOrders` ne ammette **due**, con `UnprocessableEntityException`.
4. `document-include.util.ts:64-71` — il pannello Includi offre `CustomerOrder` solo per `SalesDdt`: **una**.

L'unica barriera per la Vendita manuale nel menu è un filtro di UI (`customer-order-form.component.ts:1035-1037`).

**Causa radice** — Non esiste una matrice unica: `getMeta` deriva le destinazioni dai tipi che **scaricano magazzino**, criterio diverso da «può agganciare un ordine cliente». Il commento del progetto lo dice già altrove: «Un filtro di UI non è una protezione» (`manual-sales-orders.service.ts:661-664`).

⚠️ Conseguenza asimmetrica: la Fattura accompagnatoria **riceve** un ordine via «Genera» ma non ha la voce «Ordine cliente» nel proprio pannello «Includi». La stessa coppia esiste in una direzione e non nell'altra.

**Livello** — UI + API.

**Rischio di regressione** — Derivando la matrice da `canAttachOrders`, la Vendita manuale sparisce dal menu «Concludi ordine» (oggi la toglie il client): va verificato che nessun percorso storico la usasse.

**Test che oggi fallirebbe** — `POST manual/:id/conclude-prefill` con `{documentType: 'manual_unload'}` su tenant con la funzione **accesa** → atteso 422 alla richiesta del prefill. Oggi 201, e il 422 arriva solo al salvataggio: l'operatore compila e perde il lavoro.

---

### 3.22 ⚠️ Due motori economici e due motori di prefill per lo stesso comando

**Specifica** — §13.3: non introdurre una seconda matematica economica. §23.4: il percorso client-side e quello server-side non devono restare motori paralleli.

**Codice, economia** — `manual-sales-order.util.ts:139-191` (sconto **stringa** a cascata, moltiplicatore esatto, troncamento intermedio a 4 cifre di centesimo, `Math.round` finale) contro `documents.service.ts:3681-3685` (sconto **percentuale numerica**, nessun troncamento). Colonne diverse: `discount String?` contro `discountPercent Decimal(7,4)`. Lo stesso client manda le due forme dalla stessa maschera (`customer-order-form.component.ts:5000` vs `:5128`).

**Codice, prefill** — Lo stesso comando «Concludi ordine» precompila in due modi: righe costruite nel **client** per il DDT (`:2004-2016`, `includedPayloadFromSalesOrder`), richieste al **server** per la Fattura accompagnatoria (`sales-document-form.component.ts:3106-3110`, `concludeManualPrefill`). ⭐ È anche la ragione strutturale per cui il warning di copertura esiste su una destinazione e non sull'altra (§3.1).

**Causa radice** — L'Ordine cliente non vive in `documents`: il motore è stato scritto accanto invece che riusato. Ogni regola economica va mantenuta due volte — il contratto binario IVA è stato aggiunto al percorso documenti prima e a questo dopo (`manual-sales-order.util.ts:150-155`, correzione datata 23/08/2026).

**Impatto misurato** — Nessuna divergenza **numerica** sui casi normali: `parseEffectiveDiscountPercent` conserva quattro decimali, quindi «4+10%» vale 13,6 su entrambe le strade. L'impatto è di manutenzione.

⚠️ **Commento menzognero:** `customer-order-form.component.ts:5126-5127` dichiara «cascata "4+10%" → 14», che è il comportamento **vecchio** (colonna INTEGER). Chi lo legge conclude che i due percorsi divergano di mezzo punto.

**Livello** — API + DB.

**Rischio di regressione** — Unificare tocca la forma persistita dello sconto su una tabella con dati esistenti: **migration su database condiviso** più lettura retrocompatibile. ⚠️ La regola è formulata come divieto di **introdurre**, non come ordine di unificare: senza decisione esplicita non è un lavoro da avviare.

**Test da scrivere prima di qualunque unificazione** — Caratterizzazione: quantità 1/3/7 × prezzi 33,33 e 20,491803 × sconti «10», «4+10», «2+5+8»; asserire che `computeManualOrderLines` e `computeLines` producano lo stesso `totalMinor`.

---

### 3.23 ⚠️ Testo morto: i commenti citano come vigente la regola che §21 supera

**Specifica** — §21.7: «Parzialmente concluso è uno stato del workflow manuale» è **superata**; §21.5: «un ordine esiste solo se completo» è **superata**.

**Codice** — `sales-order.model.ts:199-203`: «"Parzialmente concluso" nasce quando il DDT che ha incluso l'ordine non copre tutti i prodotti». `manual-sales-orders.service.ts:751-756`: cita testualmente «prompt DDT §LOGICA MAGAZZINO». `documents.service.ts:3395-3401`: idem. `manual-sales-order.util.ts:242-244`: «un ordine esiste solo se completo — cliente + almeno una riga valida» (il codice **non** la applica).

**Causa radice** — Documentale prima che tecnica: i commenti sono la trascrizione fedele della regola precedente, e chi legge il codice trova una fonte normativa che `docs/18` ha revocato. È il «testo morto» che `regole-qualita` vieta.

**Livello** — Tutti (documentazione interna).

**Rischio di regressione** — ⛔ Correggere il solo codice lasciando i commenti riporterebbe la regola in vita al primo intervento successivo. I riferimenti a «prompt DDT §LOGICA MAGAZZINO» vanno sostituiti col rinvio a `docs/18` §2.3/§7.4.

**Guardia proposta** — Non un test di runtime: un controllo di testo dentro `npm run lint` che faccia fallire la build se in `src/app` o `api/src` ricompare «Parzialmente concluso» o `PartiallyConcluded`. È la forma già usata nel progetto (`scripts/check-exit-label.mjs`).

---

### 3.24 ⚠️ La colonna Impegna non conosce lo stato, e non ha un posto dove conoscerlo

**Specifica** — §9.2: `Annullato → nascosta`, `Da confermare → nascosta`, `Confermato → visibile`.

**Codice** — `customer-order-form.component.ts:2128-2158`, corpo completo: (a) filtro sul catalogo del tipo (`:2145-2147`), (b) caso seriali (`:2151-2156`), (c) preferenza utente (`:2157`). Nessun riferimento a `orderState`, `isConcluded`, `isSettledOrder`, `cancelledAt`.

Verificato per esclusione anche il catalogo (scelto una volta per **tipo**, `:545-551`) e il componente di riga condiviso: la policy non c'è in nessuno dei tre posti.

**Causa radice** — La visibilità è modellata come proprietà del **tipo documento** e della **preferenza utente** — due dimensioni statiche — mentre §2.2 la vuole funzione dello **stato**, che è dinamico.

⭐ La maschera **sa già** distinguere gli stati per altri scopi (`isSettledOrder()` rende il selettore Stato in sola lettura, `isConcluded()`/`isPartiallyConcluded()` a `:582-586`): il dato per decidere è in casa, manca solo che la funzione lo interroghi.

**Livello** — UI.

**Rischio di regressione** — ⛔ Lo **stesso** predicato alimenta intestazione, riga, card e calcolo larghezze (`:2168-2177`), ed è dichiarato tale apposta: il commento a `:2172-2176` racconta il difetto già pagato (somma larghezze 116,84%). Introdurre la condizione in uno solo dei consumatori rimette in vita quel difetto.

⚠️ **Domanda che la specifica non chiude:** una policy di stato prevale sulla preferenza colonne dell'operatore o si compone con essa? Oggi lo stesso interruttore governa entrambe, quindi la colonna può essere nascosta in `Confermato` (dove la specifica la vuole visibile) e visibile in `Annullato`.

**Test che oggi fallirebbe** — Ordine annullato: asserire che la colonna non sia resa né in intestazione né nelle righe, e che le larghezze restanti sommino a 100%.

---

## 4. Le decisioni che mancano

Punti che la specifica stessa lascia aperti. **Nessuna risposta è inventata qui.**

### 4.1 ⏸ Come rappresentare `Da confermare` in database — §2.4

§2.4 dichiara: «DECISO funzionalmente», «rinvio **tecnico**, non funzionale», e «questa specifica non sceglie a priori se la rappresentazione debba essere un campo stato, un timestamp dedicato o altra soluzione equivalente».

> **Domanda:** colonna enum di stato manuale, timestamp dedicato, o altra forma?

Elementi da mettere sul tavolo, misurati: `cancelledAt` e `fulfilledAt` **non sono** colonne del solo ordine manuale — le scrivono anche `online-order-lifecycle.service.ts:175-199` e `shopify-sync.service.ts:428-439`. Una rappresentazione che le riusi cambia il significato degli ordini di canale. E `Da confermare` **non è un evento datato**: è una scelta che non produce nessun fatto, quindi non ha una colonna-evento che possa ospitarla.

Sei consumatori da riallineare insieme: `manualOrderState()` (`sales-order.model.ts:213`), `buildStateFilter` (`sales-order-query.util.ts:126`), `API_STATE_VALUES` (`sale-order.enum-mapper.ts:36`), il DTO di salvataggio, la colonna Stato dell'elenco, l'export CSV.

### 4.2 ⏸ `Da confermare` è il nuovo default? — §5.1

§5.1 dice «lo stato iniziale proposto resta Confermato», e §2.1 registra il default corrente. Ma l'introduzione di un quarto stato riapre la domanda operativa.

> **Domanda:** un ordine nuovo nasce `Confermato` (come oggi, impegnando subito) o `Da confermare` (senza impegnare, con un gesto esplicito di attivazione)?

### 4.3 ⏸ La resa della colonna `Impegna magazzino` in `Concluso` — §9.2

§2.2 rimanda («DECISIONE UI DA CHIUDERE: vedi §9.2»); §9.2 scrive «Resta da deliberare **soltanto la resa della colonna**… deve essere confermata dall'owner prima della modifica UI».

> **Domanda:** colonna **nascosta** (opzione che §9.2 indica come raccomandata) oppure **mostrata come dato storico read-only inequivocabile**?

⛔ Va detto insieme alla domanda: lo stato di **oggi** non è nessuna delle due — è la configurazione che §9.2 vieta esplicitamente (§3.6). Qualunque risposta comporta una modifica UI.

⚠️ Domanda collegata, che §9.2 non pone: una policy di stato **prevale** sulla preferenza colonne dell'operatore o si **compone** con essa? Oggi lo stesso interruttore le governa entrambe (§3.24).

### 4.4 ⏸ L'eliminazione di un ordine collegato — §15.3

§15.3 è intitolata «Decisione di prodotto da confermare prima dell'implementazione», introduce con «**Raccomandazione:**» e chiude con «deve essere approvata dall'owner prima di diventare norma definitiva».

> **Domanda:** un Ordine con collegamento documentale definitivo è **ineliminabile** (l'operatore deve prima scollegare col contratto `12`), oppure è **eliminabile conservando il legame** in altra forma?

⛔ La domanda va posta **insieme** a §3.7, non dopo: §15.2 terzo punto è vincolante a prescindere dalla risposta, e le due forme di correzione sono diverse (rifiuto secco vs. migration che conserva il legame). ⚠️ La procedura presupposta esiste (`documents.service.ts:1505-1510`) ma ha due uscite a vuoto (`:3556`, `:3559-3562`) mentre lo sgancio avviene comunque: «scollega e poi elimina» va **verificata**, non data per funzionante.

### 4.5 ⏸ La scelta di Listino è un dato del documento? — §13.3

§13.3 legifera l'**effetto** del cambio Listino e tace sulla persistenza. Il codice ha deciso da sé (`customer-order-form.component.ts:1745-1751`: «non si memorizza e alla riapertura torna su "Prezzo di vendita"»), e nessuna colonna esiste.

> **Domanda:** il Listino è un **dato dell'ordine** (si persiste, si riapre com'era, si eredita da duplicazione e Genera) o resta un **comando di riempimento**?

Se resta un comando, va deciso come etichettarlo: oggi la tendina dice «Prezzo di vendita» su un documento compilato a Listino 2, cioè dice il falso, e chi la preme credendo di confermare riprezza tutto.

### 4.6 ⏸ §14.1 contro la convenzione «si salva e si resta dentro»

Non è un punto che §18 dichiari aperto, ma è un **contrasto fra due decisioni entrambe scritte**: §14.1 chiede la conferma al primo Salva; la maschera implementa la convenzione opposta, decisa nell'08/2026 e presente anche nell'Ordine fornitore (§3.17).

> **Domanda:** §14.1 vale e la convenzione va cambiata su tutte le maschere documentali, oppure §14.1 va corretta nella specifica?

Non è Claude a deciderlo, e non è un arretrato da colmare in silenzio.

### 4.7 ⏸ Il contenuto del CSV «corrispettivi Shopify»

§20 non parla di questo export. Il file oggi contiene anche gli ordini manuali (§3.16), e potrebbe già essere usato in una procedura contabile.

> **Domanda:** quell'export è dei **soli corrispettivi di canale** (e allora va aggiunto un filtro origine di default) oppure è l'**export dell'elenco** (e allora va allineato il contratto dei filtri e rinominato)?

---

## 5. Che cosa NON è stato verificabile

**5.1 ❔ `Da confermare` non è eleggibile come sorgente (§18.2, OC-MAN-015).** Lo stato non esiste come valore persistibile: nessun ordine può trovarsi in quel modo e la condizione è vera **a vuoto**. Non è né rispettata né violata. ⚠️ Ciò che si può dire è prospettico e va scritto: il filtro `includable` (`sales-order-query.util.ts:80-86`) è **cieco allo stato** — guarda `source`, `cancelledAt`, `documentId` — quindi `Da confermare` nascerà **includibile** se la migration non tocca anche quel punto.

**5.2 Nulla è stato eseguito.** Nessun test, nessuna build, nessuna query al database, nessun `tsc`. Tutti i verdetti derivano dalla lettura dei corpi delle funzioni. Le affermazioni sul comportamento a runtime sono quindi inferenze dal codice, non misure.

**5.3 Una corsa di inizializzazione non dimostrata.** All'apertura di un ordine in modalità **ivata**, `patchFormFromOrder` calcola il prezzo mostrato con `this.rateOfVatCodeId(...)` (`customer-order-form.component.ts:4682-4687`), che legge `vatCodeById()`, alimentato da un `toSignal` con `initialValue: []` (`:886-889`). Se l'ordine arrivasse prima dei Codici IVA, l'aliquota varrebbe 0, il campo mostrerebbe il **netto** sotto un'intestazione «ivato», e nessun `effect` lo rifarebbe (i due soli, `:1843` e `:1860`, riguardano topbar e breadcrumb). Il valore **salvato** resterebbe corretto (`lineNetMinor` restituisce il netto memorizzato finché il campo non viene ridigitato). Nell'ordine di sottoscrizione i Codici IVA partono prima, quindi la corsa è improbabile — ma non è impedita da niente. **Non classificata come divergenza perché non dimostrata**: un test che ritardi deliberatamente la risposta dei Codici IVA la chiuderebbe in un modo o nell'altro.

**5.4 Il ramo è cambiato durante l'audit.** Tre file portano modifiche **non committate**:

- `api/src/order-reservations/stock-reservation.service.ts` — 91 righe: la correzione del cambio variante (§D3). Su HEAD il difetto c'è ancora. **La correzione è a metà: nessun test la copre**, e lo spec ha guadagnato solo un import inutilizzato che da solo farebbe fallire `no-unused-vars`.
- `api/src/sales-orders/sales-orders.controller.ts` — il `@CurrentUser()` sull'export: senza, il CSV esce dal perimetro sedi.
- `api/src/sales-orders/sales-orders-export.service.ts` — 57 righe collegate.

⚠️ **Chiunque rimisuri su HEAD otterrà risultati diversi da quattro degli esiti qui riportati.** I numeri di riga di `stock-reservation.service.ts` citati nel censimento (100-111, 325-334, 347-361) non esistono più nell'albero corrente.

**5.5 Perimetri non giudicati, dichiarati per non lasciare buchi.**

- **Allegati e origine:** `POST/DELETE /sales-orders/:id/attachments` non controllano l'origine, quindi si possono allegare file a un ordine Shopify. Non contato come violazione di §17.2 perché un allegato è metadato di VestiFlow, non dato di canale — ma se il proprietario intendesse anche questo, sarebbe una decisione da scrivere. (Il difetto di **sede** su quelle stesse rotte è invece contato: §3.9.)
- **Totali di testata:** `computeManualOrderTotals` e la ripartizione IVA con lo sconto extra documento appartengono a un'altra dimensione economica; il motore è stato toccato solo per la frase finale di §13.3.
- **§23.3, censimento per la rimozione dell'enum:** `forceConclude` è l'unico consumatore manuale di `partially_fulfilled`; il censimento formale che §23.3 richiede va fatto nella dimensione stati.

**5.6 Un difetto adiacente, non coperto da nessuna delle 102 regole.** La conclusione in **modifica di documento già confermato** è ristretta a `sales_ddt` (`documents.service.ts:2240-2243`). Aggiungere un ordine a una **Fattura accompagnatoria già confermata** ne occupa quindi il `documentId` — rendendolo non più includibile — **senza mai concluderlo né consumarne gli impegni**. Non è evasione parziale: è un ordine che resta appeso. Va verificato separatamente.

---

## 6. Sequenza di lavoro proposta

⛔ **Vincolo del mandato: la migration per `Da confermare` NON è autorizzata in questa tranche.** Le fasi sotto sono ordinate perché ogni fase sia eseguibile senza quella migration, e perché nessuna corregga un sintomo prima della sua causa.

---

### Fase 0 — Mettere in sicurezza ciò che è già in volo _(prima di ogni altra cosa)_

1. **Committare o scartare le tre modifiche pendenti** (§5.4), con decisione esplicita del proprietario. ⛔ Finché restano non committate, tre verdetti di questo audit descrivono un albero che non è il ramo.
2. **Completare la correzione del cambio variante**: scrivere i test che oggi non esistono (`syncOrderReservationsTx` non è esercitato da nessuna prova) e togliere l'import inutilizzato. ⚠️ Il motore della Impegnata ha uno spec di 101 righe che verifica **solo** lo scope sede di `listActiveForLevel`: `sync`, `release`, `consume` e `restore` non sono coperti da niente. È la ragione per cui il difetto del `variantId` è potuto restare invisibile.

**Perché prima:** correggere altro sopra un albero incerto rende ogni misura successiva non riproducibile.

---

### Fase 1 — Le due porte aperte all'operatore _(indipendenti, correggibili subito)_

3. **§3.3 — Il gate Cliente/Location su mobile.** Una riga: la guardia già presente negli altri due gestori. È il difetto più economico da chiudere e il più imbarazzante da lasciare aperto: su metà dei dispositivi si compilano righe che poi non si vedono.
4. **§3.9 — Le sette rotte senza scope sede.** Assert sulla sede dell'ordine, predicato di **lettura**. È una perdita di riservatezza fra sedi, e sei delle sette servono **allegati**.

**Perché ora:** entrambe sono chiuse, non toccano nulla del motore stati, e non dipendono da nessuna decisione aperta.

---

### Fase 2 — La causa radice numero uno: la copertura non decide lo stato

5. **§3.1 — Rendere `Concluso` incondizionato** dopo un collegamento validamente salvato (`documents.service.ts:3493-3501`).
6. Nello **stesso** intervento: adeguare `reopenLinkedManualOrderTx` (`:3521-3531`), che oggi ripesca gli ordini anche per `partially_fulfilled`, e `isSettled` (`manual-sales-orders.service.ts:351-353`).
7. **Rimuovere il workflow `forceConclude`**: endpoint, servizio, client HTTP, e il ramo «No» del dialogo — che resta a **due** uscite come warning informativo. ⛔ **Non toccare l'enum Prisma** né l'evento `online_order_partially_fulfilled`: hanno consumer Shopify vivi.
8. **Ripulire le quattro superfici** che mostrano «Parzialmente concluso» e i **commenti** che citano «prompt DDT §LOGICA MAGAZZINO» (§3.23), con la guardia di testo in `npm run lint`.

**Perché in blocco:** sono un solo difetto e i suoi effetti. ⛔ Rimuovere `forceConclude` **prima** di correggere il ramo lascerebbe gli ordini già `partially_fulfilled` senza via d'uscita. Correggere il ramo **senza** toccare la riapertura spegnerebbe il recupero degli storici.

**Perché prima della Fase 3:** metà dei problemi di eleggibilità sparisce quando non esiste più lo stato intermedio.

---

### Fase 3 — La causa radice numero due: eleggibilità e riapertura, insieme

9. **§3.2, parte A — La riapertura per la Fattura accompagnatoria.** Separare le due decisioni oggi governate da `wasStockUnloaded`: «storna il magazzino» resta legata a `invoiceAccompanyingUnloadsStock`; «riapri l'ordine» diventa incondizionata rispetto al tipo.
10. **§3.2, parte B — L'eleggibilità sullo stato.** Aggiungere `fulfilledAt: null` al filtro `includable` e la guardia corrispondente in `syncIncludedSalesOrdersTx`.
11. **§3.19 — La validazione delle transizioni in `save`**, in un punto solo. Vieta il **cambio di stato** su un ordine settled, non il salvataggio (§7.5 lo ammette).

⛔ **9 e 10 non si separano.** Stringere il filtro senza ripristinare la riapertura rende gli ordini già orfani **definitivamente inutilizzabili**: non includibili e non concludibili.

**Perché 11 qui:** la validazione servirà comunque alla migration di §2.4, e scriverla ora significa scriverla una volta sola, prima che gli stati si moltiplichino.

---

### Fase 4 — La disciplina dello snapshot e dell'intento _(prerequisito di §9.2)_

12. **§3.20 — Il contratto binario per `commitsStock`** in `computeManualOrderLines`, nella stessa forma già usata per `vatCodeId` otto righe sopra. ⛔ **Va fatta prima di §9.2**, o nascondere la colonna produrrà la perdita di dati che §9.3 vieta.
13. **§3.11 — Aggiungere `kind` a `effectiveCommits`** (il dato è già selezionato dalla query e mai letto), e alla gemella della riapertura. ⚠️ Comporta il rilascio, al primo risalvataggio, degli impegni oggi attivi su articoli-servizio.
14. **§3.10 — L'intento nel prefill «Includi»**: derivarlo dall'eleggibilità, non da `Boolean(variantId)`. ⚠️ Va deciso **come** procurare l'eleggibilità (nel payload o con una lettura dopo il prefill): nel secondo caso la spunta cambierebbe dopo che l'operatore ha visto la riga.
15. **§3.13 — Il pannello articolo su riga persistita.** Richiede prima la decisione: non toccare le righe persistite, oppure toccarle e dichiararlo. ⛔ **Non toccare il risolutore**, condiviso da otto maschere.

**Perché in questa fase:** 12 è un prerequisito tecnico di §9.2; 13 e 14 sono lo stesso difetto ai due capi della catena (il server non filtra, il client accende); 15 attende una decisione ma appartiene alla stessa disciplina.

---

### Fase 5 — Ciò che l'operatore vede sbagliato senza saperlo

16. **§3.12 — Il warning multi-riga**, corretto nell'utility condivisa (`variant-availability.util.ts`) e non nell'Ordine cliente, o si tornerebbe alle tre implementazioni divergenti.
17. **§3.4 — Il Listino per manager e commesso**, seguendo il precedente `users/me` già adottato per il netto/ivato. Va deciso insieme se `defaultVatCodeId` abbia lo stesso problema.
18. **§3.14 — Il cambio Listino**: terzo esito «articolo non leggibile» accanto a `prices`/`missing`, e chiamata a `rememberLineNet`.
19. **§3.8 — Il gating Shopify sul filtro Origine**, col precedente esatto di `product-list.component.ts:316-322`, e la normalizzazione del query param.
20. **§3.15 — La memoria netto/ivato** (`remember` sul solo ramo di **creazione**) e l'eredità di `pricesIncludeVat` nella duplicazione.
21. **§3.5 — La riga tecnica di ricerca.** ⚠️ Richiede prima una decisione di prodotto: marcatura esplicita o campo di query separato. ⛔ Rifiutare le righe senza variante è la correzione sbagliata.

**Perché dopo:** nessuno di questi blocca gli altri, e tre su sei attendono una scelta.

---

### Fase 6 — Ciò che dipende da una delibera del proprietario

22. **§4.3 → §3.6 e §3.24 — La colonna `Impegna` per stato.** ⛔ Non eseguibile prima della delibera, e **non prima del punto 12**. ⚠️ Va introdotta in `isLineColumnVisible`, che è il punto unico interrogato da intestazione, riga, card e larghezze: metterla altrove rimette in vita il difetto di geometria già pagato.
23. **§4.4 → §3.7 — L'eliminazione con collegamento.** La forma della correzione dipende dalla risposta. ⛔ Il minimo di §15.2 vale a prescindere; e va appoggiata su `documentId`, **mai** su `fulfilledAt`, o si reintroduce la guardia di stato che §16 vieta.
24. **§4.6 → §3.17 — §14.1 contro la convenzione di salvataggio.** Contrasto fra due decisioni scritte: va risolto, non implementato d'ufficio.
25. **§4.7 → §3.16 — Il contenuto del CSV.** ⚠️ Potrebbe già essere in una procedura contabile.
26. **§4.5 → La persistenza del Listino.**

---

### Fase 7 — Debito strutturale, da avviare solo su decisione esplicita

27. **§3.18 — La chiave di idempotenza sul primo salvataggio.** Precedente disponibile: `OnlineOrderEvent.dedupeKey`. ⛔ Richiede **migration su database condiviso** — SQL a mano, `npm run prisma:deploy`, mai `migrate dev`.
28. **§3.21 — La matrice di coppia unica** per Includi e Genera.
29. **§3.22 — L'unificazione dei motori economici e dei due prefill.** ⚠️ La regola vieta di **introdurre** una seconda matematica, non ordina di unificare. Prima i test di caratterizzazione, poi la decisione. Comporta migration sulla forma persistita dello sconto.
30. **Il difetto adiacente di §5.6** — la conclusione in modifica ristretta a `sales_ddt`.

---

### La migration di `Da confermare`, quando sarà autorizzata

Non è in questa sequenza. Quando lo sarà, richiede:

- la decisione §4.1 (rappresentazione) e §4.2 (default);
- la validazione delle transizioni **già scritta** al punto 11;
- il filtro `includable` **già ancorato allo stato** al punto 10 (altrimenti `Da confermare` nascerebbe includibile, §5.1);
- il riallineamento simultaneo dei sei consumatori censiti in §4.1;
- ⛔ SQL scritto a mano, `prisma:deploy`, mai `migrate dev` né `db push` né `migrate diff --from-schema-datasource`.

⭐ **Le fasi 2, 3 e 4 rendono quella migration un lavoro molto più piccolo di quanto sia oggi:** senza lo stato intermedio, con l'eleggibilità ancorata allo stato e con la validazione delle transizioni già in un punto solo, aggiungere il quarto stato smette di essere un intervento a sei consumatori indipendenti.
