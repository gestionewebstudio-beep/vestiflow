# Specifica — il Listino sui documenti

> **Cos'è.** Le regole del **Listino applicato alle righe**: chi lo propone, cosa
> succede scegliendolo, come si comporta un prezzo a zero, e cosa resta salvato.
>
> **Stato.** Decisioni del proprietario del **24/08/2026**. Parte è già implementata —
> più di quanto la prima stesura credesse — e la §6 misura che cosa manca davvero.
>
> **Rapporto con le altre specifiche.** `03` governa le righe, `03c` il risolutore,
> `CONTRATTO-COMUNE-DOCUMENTI` il denaro. Dove questo documento e quelli divergono, va
> allineato **quello vecchio**: qui c'è la decisione più recente. Due punti di
> contrasto già noti sono elencati in §6.

---

## 1. Il Listino del cliente è un valore PROPOSTO, non imposto

| Il cliente scelto…                | Il campo Listino in testata      | Le righe nuove prendono   |
| --------------------------------- | -------------------------------- | ------------------------- |
| **ha** un listino predefinito     | si precompila con quello         | il prezzo di quel listino |
| **non ha** un listino predefinito | resta su **«Prezzo di vendita»** | il **prezzo di vendita**  |

⭐ **Proposto, quindi modificabile.** Scegliere il cliente riempie il campo; l'operatore
può cambiarlo, e da quel momento comanda la sua scelta. Cambiare cliente ripropone il
listino del nuovo cliente.

### ✅ Il campo non resta mai VUOTO: dice sempre quale prezzo si sta usando — deciso il 24/08/2026

> **Il selettore ha una voce esplicita «Prezzo di vendita», ed è quella predefinita. Non
> esiste lo stato «campo vuoto».**

⛔ **Qui c'era «il campo Listino resta vuoto».** Era la prima stesura di questa specifica,
del mattino del 24/08, ed è stata rovesciata la sera stessa guardando la maschera Fatture —
dove la voce esplicita **c'era già**. Le ragioni per cui il vuoto perde:

**1. Non esiste un documento i cui prezzi vengano da nessuna parte.** Anche senza listino il
prezzo viene da un posto preciso: il prezzo di vendita dell'articolo. Rappresentare quel posto
come **assenza** è dire che non c'è, quando è il caso più frequente di tutti.

**2. In una testata VestiFlow il vuoto significa già un'altra cosa.** Nella stessa riga di
campi, «Seleziona cliente…», «Seleziona sede…», Causale e IBAN vuoti vogliono dire tutti
_non l'hai ancora compilato_ — c'è perfino un colore dedicato per quando quel vuoto blocca le
righe (`--color-field-waiting`, `regole-stile-ui` §5). Un Listino vuoto insegnerebbe un
secondo significato del vuoto **nella stessa riga**, da imparare campo per campo.

**3. ⭐ Il caso «torna indietro» fa collassare l'alternativa su questa.** Cliente Rossi ha
«Ingrosso», il campo si precompila, ma questo documento lo vuoi a prezzi normali. Con la voce
esplicita la scegli come qualsiasi altra: un gesto solo, stesso riprezzamento, stessa conferma.
Col campo vuoto devi **svuotarlo** — e svuotare è un gesto diverso dal selezionare: richiede
una × o una voce «Nessuno». Cioè **la voce esplicita reintrodotta con un'etichetta che dice
_niente_ invece di dire _cosa succede_**.

**4. Uno stato in meno è un ramo in meno che può sbagliare.** «Nessun listino» e «prezzo di
vendita» non sono due stati: sono lo stesso. Tenerli distinti dà N+1 stati per N comportamenti,
e ogni ramo del codice deve gestirli entrambi — finché uno non li gestisce diversamente. È il
difetto 3 del §6, la stessa condizione con quattro esiti fra le maschere.

⚠️ **Il controargomento, e come si smorza.** «Prezzo di vendita» non è un listino, e un elenco
intitolato _Listino_ che ne contiene tre più una non-listino è un piccolo errore di categoria.
Pesa poco: in anagrafica quei valori sono **già una famiglia sola**, governata da **un solo**
selettore netto/ivato (§7). Se sono la stessa grandezza lì, essere voci dello stesso elenco qui
è coerente. Basta metterla **prima**, staccata dalle altre.

### Come si mostra e come si memorizza sono due scelte separate

```text
UI          voce esplicita «Prezzo di vendita»   ← l'operatore vede sempre la sorgente
STORAGE     null                                 ← nessun valore sentinella nel database
```

⭐ Così si evitano entrambi i difetti: nessun vuoto ambiguo davanti all'operatore, e nessun
codice speciale tipo `'sale'` che ogni query e ogni report dovrebbero poi conoscere. La
traduzione avviene **al confine**, in un punto solo.

### ⚠️ La trappola di implementazione che nasce da qui

> Documento salvato con «Prezzo di vendita» per un cliente che ha «Ingrosso». Riaprendolo,
> **non deve** riproporre Ingrosso.

Cioè: **la proposta dal cliente scatta quando il cliente CAMBIA, non al caricamento del
documento.** È il difetto più facile da introdurre, perché il codice più naturale da scrivere
— «se c'è un cliente, applica il suo listino» — confonde le due cose e tradisce il §4.

---

## 2. Scegliere un listino

```text
Cliente: Rossi          Listino: «Prezzo di vendita»   ← la voce predefinita

Articolo A    prezzo di vendita 25,00    Listino Ingrosso 18,00

  aggiungo l'articolo, resta «Prezzo di vendita»   →   prezzo riga  25,00
  scelgo «Ingrosso»                                →   prezzo riga  18,00
  torno a «Prezzo di vendita»                      →   prezzo riga  25,00
```

**Cambiando listino, le righe già presenti si riprezzano tutte** con i nuovi valori
proposti.

### ✅ Tutte vuol dire TUTTE — deciso il 24/08/2026

> **Anche le righe il cui prezzo è stato modificato a mano o negoziato prendono il nuovo
> prezzo. Nessuna riga è esente, nessuna eccezione da riconoscere.**

⭐ **È la regola più semplice che esista, ed è il suo pregio.** Cambiare listino significa
«questo documento si fa a quelle condizioni», e un documento a condizioni miste non è quello
che l'operatore ha chiesto. La regola alternativa — proteggere le righe toccate a mano —
richiederebbe alla riga di ricordare **da dove viene** il proprio prezzo, cioè un dato in più
da mantenere, da salvare e da tenere giusto per sempre. Non esiste oggi, e questa decisione
evita di doverlo introdurre.

⚠️ **Il costo, e va detto perché ricadrà sull'operatore.** Chi ha trattato un prezzo riga per
riga e poi cambia listino **perde la trattativa**, e la perde in silenzio. Da qui discende un
requisito che non è un abbellimento: **il cambio di listino su un documento che ha già righe
si annuncia prima di applicarlo**, dicendo quante righe verranno riprezzate, con la
possibilità di rinunciare. È un'azione sensibile nel senso di `regole-gestionale` — riscrive
in blocco valori economici già inseriti — e le azioni sensibili chiedono conferma.

---

## 3. Un listino che vale ZERO

> **UI: campo vuoto. Valore economico: zero. Nessun ripiego sul prezzo di vendita.**

```text
LISTINO SCELTO
      ↓
prezzo di listino = 0
      ↓
a video: campo VUOTO          ← scelta di rappresentazione
      ↓
valore economico: 0           ← non null, non il prezzo normale
      ↓
Salva → il documento conserva 0, i totali si calcolano con 0
```

⛔ **Il ripiego sul prezzo di vendita NON scatta quando un listino è stato scelto.**
Scatta solo nel caso di §1: **nessun listino selezionato**.

⚠️ **Perché il campo si mostra vuoto e non «0,00».** Sono due letture diverse per
l'operatore: «0,00» sembra un prezzo deciso, il vuoto sembra un prezzo da mettere. Qui
il prezzo È deciso e vale zero — ma mostrarlo come 0,00 in mezzo a righe da 18 e 25
euro fa sembrare la riga un errore di battitura. Il vuoto dice «questo articolo, in
questo listino, non si fa pagare».

### ✅ E il caso GEMELLO — l'articolo senza prezzo per quel listino

Qui c'era «non è deciso». **Lo era, ed è pure implementato** — misurato il 24/08 in
`document-listino.util.ts:41-56`, che lo scrive per esteso:

> `null` significa **una cosa sola**: l'articolo non ha un valore per il listino scelto. Non
> è un errore di lettura e non si ripiega sul prezzo articolo — chi chiama mette la riga a
> zero e **lo segnala**, perché un prezzo che nessuno ha deciso non deve finire in un
> documento senza che si veda.

```text
listino scelto, articolo SENZA valore per quel listino
      ↓
riga a ZERO  +  segnalazione                ← non ripiega sul prezzo di vendita
```

Il segnale esiste già: `listinoWarnings` in `sales-document-form.component.ts:377` —
«righe rimaste a zero perché l'articolo non ha un prezzo per quel listino».

⭐ **Assente e zero portano allo stesso valore economico ma NON alla stessa esperienza**: lo
zero è una condizione commerciale decisa da qualcuno, l'assente è un buco in anagrafica. Il
primo è silenzioso, il secondo si segnala. È la distinzione che rende accettabili tutti e due.

⚠️ **Il modello dell'avviso è già in casa**, ed è quello dell'anagrafica: _«Prezzo Shopify a
zero: l'articolo verrà pubblicato a 0. Puoi salvare comunque.»_ Non blocca, nomina la
conseguenza, lascia decidere. Usare la stessa forma evita di inventare un secondo modo di
dire la stessa cosa.

### ⛔ 3.1 Gli stati sono TRE, e il terzo non è un prezzo

> **«Cella vuota» non è uno stato: è come si mostrano due stati diversi. Il terzo non deve
> mai finire nello stesso mucchio.**

| Lo stato                                                  | A video                       | Nell'economia | All'operatore |
| --------------------------------------------------------- | ----------------------------- | ------------- | ------------- |
| **1. il listino vale ZERO**                               | cella vuota                   | **0**         | silenzioso    |
| **2. l'articolo non ha prezzo per quel listino** (`null`) | cella vuota                   | **0**         | **segnalato** |
| **3. il dato non è stato caricato** — rete, errore        | ⛔ **niente di tutto questo** |               |               |

⛔ **Il terzo NON è «un prezzo che vale zero»**, e non va classificato né come errore
d'anagrafica né come listino a zero. È l'assenza di una **risposta**, non di un prezzo: non
sappiamo quanto vale quella riga.

⚠️ **Oggi il terzo caso è muto, ed è misurato.** Sulle Fatture il ripiego è
`catchError(() => of(null))`, e poi `if (!summary) return;`: **la riga viene saltata e conserva
il prezzo vecchio**, senza che compaia nulla. È il difetto 4 del §6. Un documento riprezzato a
metà si presenta come un documento riprezzato.

> **Requisito: un cambio listino non lascia MAI una riga col prezzo precedente in silenzio.**
> O si applica a tutte, o si dice a quali non è stato possibile.

⭐ **Fra le due, applicare-e-dichiarare è meglio che annullare tutto**: su venti righe con una
sola non caricata, rinunciare al riprezzamento intero costa più di quanto protegga. Ma la riga
non toccata dev'essere **nominata**, con la stessa forma dell'avviso di sopra — e distinta a
parole dalle righe andate a zero, perché sono due cose diverse.

⚠️ **La confusione fra il 2 e il 3 è la più facile da introdurre**, perché nel codice arrivano
entrambe come `null`: una da `listinoUnitPrice`, l'altra dal `catchError`. Se il tipo non le
distingue, le distinguerà chi legge il codice — cioè nessuno.

---

## 4. Quello che accade nel documento resta salvato

> **Riaprendo un documento, lo si ritrova nello stesso stato economico e commerciale in
> cui è stato salvato.**

Cliente · listino scelto · prezzi risultanti · prezzi modificati a mano · sconti · IVA ·
quantità · agente · gli altri valori di testata: tutto torna com'era.

```text
salvato:      Cliente Rossi · Listino Ingrosso · prezzo riga 18,00
riaperto:     Cliente Rossi · Listino Ingrosso · prezzo riga 18,00

⛔ NON:       Cliente Rossi · «Prezzo di vendita» · prezzo riga 18,00
              (la tendina che dimentica la scelta e torna al default:
               e' il comportamento di oggi, ed e' il difetto)
```

⭐ **Il prezzo di riga resta comunque una fotografia.** Se domani il Listino Ingrosso
dell'articolo passa da 18 a 20 euro, il documento già salvato resta a 18. La non
retroattività dei prezzi sui documenti esistenti è già regola del progetto
(`regole-gestionale`, «La riga di un documento è una fotografia»).

⚠️ **Le due cose non si contraddicono**: si conserva **quale listino** è stato usato —
che è un fatto del documento — e **quanto è costato** — che è la fotografia. Oggi si
conserva solo il secondo, e riaprendo la tendina dice sempre «Prezzo di vendita».

---

## 5. Il perimetro

**Il selettore va su tutti i documenti di vendita e di ordine.** Oggi lo hanno due
maschere su otto, e su una delle due solo nella vista mobile.

| Documento                             | Listino                | Nota                                        |
| ------------------------------------- | ---------------------- | ------------------------------------------- |
| Proforma · Fattura · Fatt. accompagn. | ✅ c'è                 | l'unico già su entrambe le viste            |
| Ordine cliente · Preventivo · DDT     | ⚠️ solo mobile         | da portare su scrivania                     |
| Scarico manuale                       | ✅ **sì**              | deciso il 24/08 — vedi §5.1                 |
| Vendita / Reso al banco               | ➕ da mettere          | oggi cablato sul prezzo di vendita          |
| Ordine fornitore · Arrivo merce       | ⛔ no                  | sono documenti di **costo**, non di vendita |
| **Trasferimento · Rettifica**         | ⛔ **non applicabile** | vedi sotto                                  |

⛔ **Trasferimento e Rettifica non possono avere il Listino**, e non è una scelta: il
loro profilo colonne **non ha un campo prezzo**. È `articleCode · sku · barcode ·
product · variantLabel · quantity · serials · actions`. Un listino riscrive prezzi, e lì
non c'è prezzo da riscrivere — la merce si sposta o si corregge, non si vende.

### 5.1 ✅ Lo Scarico manuale è dentro — deciso il 24/08/2026

Qui era l'unico ⏸ del perimetro. **Rientra in tutto quello che dice questa specifica**, come
gli altri tre tipi della sua maschera: selettore in testata, listino proposto dal cliente,
riprezzamento delle righe, zero mostrato vuoto, scelta conservata al salvataggio.

⚠️ **Quello che lo distingue non c'entra col listino.** Lo Scarico manuale **agisce
direttamente sulle giacenze e non crea `StockMovement`**: il documento è l'unica evidenza
dello scarico, e cancellarlo non ripristina la giacenza. È la deroga già scritta in
`regole-gestionale`, decisa dal cliente, e riguarda il **magazzino** — non i prezzi.

⛔ **Le due cose non vanno confuse.** Un tipo che non lascia traccia a magazzino non è per
questo un tipo senza economia: le sue righe hanno prezzi come le altre, e un listino le
riprezza come le altre. Escluderlo dal listino perché «è speciale» sarebbe applicare una
deroga fuori dal suo perimetro.

### 5.2 ⭐ Il prezzo Shopify come voce dell'elenco

**Idea del proprietario, 24/08/2026: aggiungere il prezzo Shopify come voce del
selettore**, così per compilare un documento coi prezzi del canale online basta
sceglierlo in testata.

Regge, e costa poco: il valore esiste già (`products.shopify_price_minor`), è un prezzo
di vendita unitario con la stessa semantica degli altri, e lo schema stesso lo chiama
«listino».

⚠️ **Con un vincolo, e va scritto**: è una **sorgente**, non una destinazione.
Sceglierlo riempie i prezzi delle righe; **non scrive nulla verso Shopify**, e non
cambia il prezzo del canale. Valgono le stesse regole di §3 per lo zero e per l'assente.

### 5.3 ⛔ L'elenco NON è fisso: i listini sono attivabili e rinominabili

> **Il selettore mostra i soli listini ATTIVI, coi NOMI dati dall'azienda. Mai un elenco
> cablato «Listino 1 · Listino 2 · Listino 3».**

Le impostazioni del tenant governano entrambe le cose —
`tenant_feature_settings.listino1Name/2Name/3Name` e `listino1Active/2Active/3Active` — e
l'anagrafica articolo le rispetta già: un tenant con due listini attivi vede due campi, coi
suoi nomi («Listino test 1», «Listino test 2»), non tre caselle numerate.

✅ **E il selettore del documento le rispetta già anche lui**, misurato il 24/08:
`listinoSelectOptions` in `document-listino.util.ts:21-31` costruisce l'elenco da
`activeListinoSlots(settings)` — «un listino spento non compare: per quel tenant non
esiste». Quindi questa regola non è lavoro da fare, è lavoro **da non disfare** quando il
selettore verrà portato sulle maschere che oggi non l'hanno.

⭐ **Con zero listini attivi il selettore sparisce del tutto**, e va bene così:
`showListinoSelect` è `listinoOptions().length > 1` — cioè «c'è almeno un listino oltre al
prezzo di vendita». Un tenant che non usa i listini non si porta dietro una tendina a una
voce sola.

**Gli slot oggi sono tre.** È un numero dell'implementazione, non della decisione: il
selettore si costruisce dagli slot attivi, e se domani diventassero quattro non va toccato.

L'elenco completo, nell'ordine:

```text
Prezzo di vendita        ← predefinita, staccata dalle altre da un filo
─────────────────────
<i soli listini attivi, coi nomi del tenant>
Prezzo Shopify           ← §5.2
```

⛔ **Un listino disattivato dopo essere stato usato non sparisce da un documento salvato.**
Vale il §4: il documento si riapre come è stato salvato. La disattivazione toglie la voce
dalle **scelte nuove**, non riscrive il passato.

---

## 6. La distanza dal codice di oggi — misurata il 24/08/2026

### Due cose non esistono affatto — e vanno entrambe fatte

Confermate dal proprietario il 24/08: il listino predefinito **va inserito in anagrafica
cliente**, per potergli assegnare un listino diverso dal prezzo base.

| Serve                                   | Oggi                                                | Da fare                                     |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **listino predefinito sul cliente**     | ⛔ nessun campo, né nello schema né nel client      | colonna nuova + campo in anagrafica cliente |
| **la scelta del listino sul documento** | ⛔ nessuna colonna su `documents` né `sales_orders` | colonna nuova su entrambe                   |

⭐ **La colonna del cliente memorizza una SCELTA, non un prezzo**, e la distinzione conta: è
il nome del listino da proporre, non un valore in denaro. Cambiare domani il prezzo di quel
listino non tocca il cliente, e non tocca i documenti già emessi.

⚠️ **Sono due migration su un database CONDIVISO col collega.** Valgono le regole di
`regole-qualita`: SQL scritto a mano, `npm run prisma:deploy`, mai `migrate dev`. E
schema, migration e deploy si fanno **insieme o per niente**: rigenerare il client con
una colonna che nel database non c'è manda in errore ogni lettura di quella tabella.

### Otto difetti già presenti, che questa specifica chiude o rende decidibili

| #   | Difetto                                                                           | Lo chiude       |
| --- | --------------------------------------------------------------------------------- | --------------- |
| 1   | ✅ **CHIUSO il 26/08/2026** — il Listino è su scrivania in tutti e quattro i tipi | §5              |
| 2   | una riga entra a 0,00 in silenzio aggiungendola dopo aver scelto                  | §3 (+ avviso)   |
| 3   | la stessa condizione dà **quattro** esiti diversi fra le maschere                 | §3              |
| 4   | una riga resta fuori dal riprezzamento senza comparire in nessun avviso           | §2 (da coprire) |
| 5   | sull'Ordine cliente i totali restano fermi dopo il cambio listino                 | difetto a sé    |
| 6   | zero e assente indistinguibili sul documento                                      | §3 per lo zero  |
| 7   | la coda decimale si perde al primo passaggio nel campo                            | difetto a sé    |
| 8   | **«Prezzo di vendita» compare DUE volte nella tendina**                           | §6.1            |

### 6.1 ⛔ La voce doppia — misurata e verificata il 24/08/2026

> **Aprendo il selettore Listino si leggono due righe «Prezzo di vendita». La prima non fa
> niente di diverso dalla seconda.**

Le tre misure che lo compongono, ognuna verificata nel file:

| Dove                                                        | Cosa                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `select-menu.component.ts:87`                               | `includeEmptyOption` vale **`true`** per difetto                         |
| `sales-document-form.component.html:221` (e Ordine cliente) | passa `placeholder="Prezzo di vendita"` e **non** spegne l'opzione vuota |
| `document-listino.util.ts:25`                               | l'elenco vero comincia già con `{ 'article', 'Prezzo di vendita' }`      |

Il pannello disegna quindi **prima** la voce vuota etichettata col segnaposto, **poi** la voce
reale: due righe con la stessa scritta. La prima emette `''`, che `parseListinoChoice`
riporta a `'article'` — cioè esattamente la seconda.

⚠️ **Per uno screen reader sono due `role="option"` fratelli con lo stesso nome accessibile e
`aria-selected` opposti**, e la spunta sta sempre sulla seconda. È il caso peggiore: non un
comando che non funziona, ma due comandi identici di cui uno è finto.

⭐ **È il difetto che l'osservazione del proprietario ha sfiorato senza saperlo**: «per default
dà già Prezzo di vendita» è vero due volte, e nessun test se ne accorge — le guardie esistenti
leggono l'array del modello, non le voci renderizzate.

**La correzione**: `[includeEmptyOption]="false"` sulle due istanze, più una guardia che
**apra il pannello** ed enumeri i `role="option"` verificando che «Prezzo di vendita» compaia
una volta sola. Una guardia che legge il modello invece del pannello non avrebbe visto niente,
ed è la ragione per cui questo è arrivato fin qui.

### ✅ Le domande aperte: nessuna

✅ **A — chiusa.** «Tutte le righe» vuol dire tutte, comprese quelle trattate a mano. Vedi
§2. Ne discende il requisito della conferma prima di riprezzare.

✅ **C — chiusa.** Lo Scarico manuale è dentro il perimetro. Vedi §5.1.

✅ **B — chiusa, e non da decidere: da SCOPRIRE.** Il listino assente mentre un listino è
scelto manda la riga a **zero con segnalazione**, senza ripiego sul prezzo di vendita. Non è
una decisione presa oggi: era già scritta in `document-listino.util.ts:41-56` e implementata
con `listinoWarnings`. Vedi §3.

⚠️ **È il caso da tenere a mente per il metodo, più che per il merito.** Questa specifica
l'ha elencata per due giorni come «domanda aperta con tre risposte possibili» mentre il
codice aveva già una risposta, motivata in un commento. **La prima misura non era andata a
fondo**, e il costo di una domanda aperta finta è che qualcuno la decida una seconda volta,
magari diversamente.

### ⛔ Quello che resta è ESECUZIONE, non decisione

⚠️ **Distinzione che va tenuta ferma**, perché il §6 si intitola «la distanza dal codice» e
si potrebbe leggere come un elenco di cose ancora da concordare. **Non lo è.** Tutto ciò che
questa specifica descrive è **deciso**: rinviarne l'implementazione è una scelta di sequenza,
non un punto aperto da riaprire.

| Deciso                                                | Quando si fa                                      |
| ----------------------------------------------------- | ------------------------------------------------- |
| il Listino scelto si ritrova alla riapertura (§4)     | dopo la struttura comune — serve una colonna      |
| il cliente col listino predefinito lo precompila (§1) | dopo — serve una colonna e il campo in anagrafica |
| l'applicatore unico delle righe (§2)                  | **subito dopo l'ottava testata**                  |
| il selettore su tutte le maschere di vendita (§5)     | con la struttura comune della testata             |

⚠️ **Prima di qualunque migration**: si verifica lo **schema reale** e si propone la modifica
**minima** necessaria. Il database è condiviso col collega, e vale `regole-qualita` — SQL a
mano, `prisma:deploy`, schema+migration+deploy insieme o per niente.

### ✅ E i due documenti che sembravano divergere NON divergono

⛔ **Qui c’era scritto che `CONTRATTO-COMUNE-DOCUMENTI` e `03c` si contraddicevano** — uno
«il prezzo mancante vale 0,00», l’altro «campo vuoto» — e che andavano riscritti tutti e
due. **Era una lettura sbagliata, corretta dal proprietario il 24/08.**

Non dicono due cose diverse: dicono **la stessa cosa in due momenti diversi.**

```text
MENTRE SI COMPILA     cella VUOTA   <- e' un SEGNALE: dice su QUALE articolo
                                       il prezzo non e' impostato
      | Salva
      v
AL SALVATAGGIO        0,00          <- ovviamente: una cella vuota vale zero
```

⭐ **Il vuoto in maschera non è l’assenza di un valore economico: è il modo di dire
all’operatore _guarda qui_.** Uno `0,00` scritto in mezzo a righe da 18 e 25 euro si legge
come un prezzo deciso e scivola via; una cella vuota si vede. È lo stesso ragionamento del §3
per lo zero, e vale identico per l’assente.

**Quindi non c’è niente da riscrivere in quei due documenti**: `03c` descrive la
compilazione, `CONTRATTO-COMUNE-DOCUMENTI` il salvataggio, ed erano già d’accordo.

⏸ **Un rinforzo possibile, esplicitamente NON necessario** (proprietario, 24/08): un **bordo
rosso tenue** sulla cella col prezzo vuoto, per renderla visibile anche a chi scorre in fretta
una tabella lunga. Resta un’opzione, non un requisito — e se si fa, va pesato il tono:
`--color-danger` dice «hai sbagliato», e qui l’operatore non ha sbagliato niente.
`--color-field-waiting` dice «manca ancora qualcosa», che è esattamente il caso.

⚠️ **E cercata, ma NON trovata**: la vecchia regola «cambio listino → _propone_ il ricalcolo e
non sovrascrive i prezzi manuali», che andrebbe rimossa in quanto superata dal §2. Cercata in
tutto `docs/` con più formulazioni — non compare in nessun documento. O è stata già tolta, o
vive solo nel codice/nella memoria di chi l'ha scritta. **Non si può potare un testo che non
c'è**: se salta fuori altrove, va tolto allora.

---

## 7. In anagrafica il netto/ivato governa GIÀ i listini — misurato il 24/08/2026

⚠️ **Sembrava una cosa da fare, ed è una cosa fatta.** Il selettore netto/ivato della scheda
articolo copre i listini dal 17/08, e non è un'inferenza:

```ts
// product-general-step.component.ts:109
const PRICE_FIELDS = [
  'sellingPrice',
  'compareAtPrice',
  'shopifyPrice',
  'listino1Price',
  'listino2Price',
  'listino3Price',
];
```

Sei campi, i tre listini compresi, riscritti tutti da `showNetPrices` al cambio di modalità.
Il commento sopra la lista lo dichiara: «il selettore è UNO per tutti e sei».

### Perché sembra che li ignori

```ts
private toDisplayed(net: number | null, ...) {
  if (net == null) { return null; }   // ← niente da convertire
```

**Un campo vuoto è identico in netto e in ivato.** Con i listini a `—`, commutare il selettore
non produce nessun cambiamento visibile — non perché siano esclusi, ma perché non c'è nessun
numero da convertire. Con 10 in «Listino test 1» e IVA al 22%, commutando si legge 12,20.

### ⏸ Il difetto vero è di INTERFACCIA, e si sistema visivamente

Il selettore governa sei campi distribuiti su **due riquadri separati** («Prezzi di vendita» e
«Listini»), e niente nel layout lo dice: chi guarda il riquadro «Listini» non ha modo di sapere
che quei campi rispondono a un comando che sta nell'altro.

⛔ **La correzione NON è una frase in più.** Deciso dal proprietario il 24/08: si stanno per
togliere molte scritte esplicative per recuperare spazio a schermo, e aggiungerne una qui
andrebbe nella direzione opposta. **Si sistema con la disposizione** — il selettore posto in
modo da coprire visibilmente entrambi i riquadri, o i due riquadri riuniti sotto di esso.

**Rinviato di proposito**, non dimenticato: è un lavoro visivo, indipendente da tutto il resto
di questa specifica, e non blocca niente.

⭐ **È lo stesso difetto del 17/08 girato al contrario.** Allora il prezzo barrato **ignorava**
il selettore in silenzio; oggi i listini gli **obbediscono** in silenzio. In entrambi i casi il
guaio è che a schermo non si vede quale delle due cose stia succedendo.

---

## ✅ Chiuso il 26/08/2026 — il controllo è UNO, e il dominio anche

**Difetto 1** (il Listino assente su scrivania) e la sua radice.

⛔ **Il controllo era scritto due volte** — dodici righe di template e tre `computed` identici
in DDT/Fatture e Ordine cliente — e sull'Ordine cliente viveva **solo nel pannello mobile**.
Portarlo sulla scrivania copiando il blocco avrebbe creato la terza copia.

Ora è `app-document-listino-select`: un componente, montato nei due contenitori che lo vestono
diversamente. Vale per tutti e quattro i tipi che passano da `customer-order-form` — Ordine
cliente, Preventivo, DDT vendita, **Vendita manuale** — più la maschera Fatture.

⭐ **E il riprezzamento è diventato dominio condiviso**: `listinoRepricing` e
`listinoMissingWarning`. Erano venticinque righe scritte due volte, e le due copie
**divergevano su un apostrofo** — `l'articolo` dritto in una, tipografico nell'altra. Stesso
testo, due glifi a seconda della maschera, nessun test che lo vedesse.

⚠️ **Il Listino era spento sulla Vendita manuale**, col commento «non è un documento di
vendita». Non era una decisione commerciale: era il **nome** — «Scarico manuale magazzino» — a
farlo concludere. Il documento è una vendita che riduce la giacenza senza generare movimenti
(§46 della specifica testate).

### Quello che resta

I difetti 2, 3, 4, 6, 7, 8 della tabella **non sono stati toccati** da questo lavoro: riguardano
il comportamento delle righe al cambio listino, non il controllo né la sorgente del prezzo.
