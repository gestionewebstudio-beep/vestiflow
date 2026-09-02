# Cosa resta da fare — VestiFlow

## ⏸ IN SOSPESO DAL 02/09/2026 — la colonna prezzo, e cosa è saltato fuori indagandola

_Il proprietario: «salva il lavoro che stavamo facendo e che ha fatto uscire fuori questi
problemi, così lo riprendiamo dopo senza perderlo»._

> ⚠️ **VINCOLO DA TENERE PRESENTE, dichiarato dal proprietario**: _«VestiFlow deve poter
> vivere anche senza implementazione Shopify»_. I difetti qui sotto **non sono difetti di
> sync**: la transizione perde giacenze e collegamenti fornitore, che sono magazzino puro.
> Shopify aggrava, non causa.

### 1 · La colonna prezzo unica — ⭐ DECISA, fatta a metà

La decisione è in `03b` §«La colonna prezzo è una sola, in ogni documento». ✅ **Fatto**:
l'Arrivo merce (il selettore agganciato al ruolo, verificato a schermo). ⏸ **Resta**:

| Dove                 | Cosa                                               | Editabile       |
| -------------------- | -------------------------------------------------- | --------------- |
| **Ordine fornitore** | colonna «Prezzo netto/ivato» col selettore         | ⛔ sola lettura |
| **Trasferimento**    | colonna attivabile                                 | ⛔ sola lettura |
| **Rettifica**        | colonna attivabile                                 | ⛔ sola lettura |
| **Inventario**       | colonna per il **controllo prezzi dei cartellini** | ⛔ sola lettura |

⭐ **Nessuna migration**: dove è in sola lettura il prezzo si legge dall'anagrafica, non è un
dato del documento. Il Trasferimento è un `Document`, e `DocumentLine.unitPriceMinor` esiste
già — ma il suo DTO non ha campi monetari e il servizio scrive `0` cablato, quindi la colonna
arriverebbe a schermo e si salverebbe a zero. Per la sola lettura non serve toccarli.

### 2 · La catena dei prezzi verso l'anagrafica — quattro difetti misurati

⭐ **Cosa FUNZIONA** (verificato tracciando la catena fino al database): l'articolo **nuovo**
porta il prezzo su `Product` **e** su `ProductVariant`, a prescindere dalla spunta — come
deciso. ⚠️ Ma «sopravvive per caso»: nessun commento lo dichiara, tre lo contraddicono, e
nessun test lo copre.

| #   | Difetto                                                                                                                                                                                                                                                                                                                                                                             | Gravità  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| a   | ⛔ **Il prezzo del carico torna indietro.** Su articolo SEMPLICE l'Arrivo merce scrive solo la variante, l'anagrafica legge e riscrive da `Product`: al primo salvataggio della scheda — **anche solo un cambio di nome** — `mirrorSimpleProductPrice` riporta il valore vecchio, che poi va su Shopify. Serve un SECONDO carico perché accada: alla creazione i due nascono uguali | **alta** |
| b   | Il **prezzo Shopify** digitato su un articolo NUOVO è scartato in silenzio: il campo non esiste nel DTO, e la variante nasce con `shopifyPriceMinor = sellingPriceMinor`. ⭐ Il proprietario ha deciso: **eredita se non compilato** (già così), ma **va rispettato se compilato**                                                                                                  | media    |
| c   | Il **prezzo barrato** su articolo ESISTENTE è digitabile ma non ha destinazione: `compareAt` non compare in `applyArticlePriceUpdates`. ⭐ Deciso: **resta vuoto se non editato** (già così), ma va salvato se editato                                                                                                                                                              | media    |
| d   | `articlePricesReadOnly` è **codice morto** (una sola occorrenza: la propria dichiarazione) e tre commenti affermano che a spunta spenta i campi sono in sola lettura. Non lo sono. ⚠️ Chi lo «riparasse» collegandolo **romperebbe** il comportamento del punto ⭐ qui sopra                                                                                                        | media    |

#### Le due strade sul difetto (a), e perché conta la scelta

**Nessuno ha mai deciso chi comanda** fra `Product.sellingPriceMinor` e
`ProductVariant.sellingPriceMinor` su un articolo semplice: l'Arrivo merce tratta come verità
la variante, l'anagrafica l'articolo. Entrambi hanno le loro ragioni.

- **(a) l'Arrivo merce scrive anche `Product`** — i due restano allineati, e la scheda mostra
  il prezzo giusto. ⭐ Il caso «più varianti a prezzi diversi» **non si presenta**: la
  correzione userebbe la stessa guardia di `mirrorSimpleProductPrice`, che esce subito se
  l'articolo ha opzioni. Il codice oggi dichiara «se servirà, è una decisione a sé»: sarebbe
  quella decisione.
- **(b) l'anagrafica non riallinea se il prezzo non cambia** — salva il dato ma **lascia il
  numero sbagliato a schermo**: il difetto si sposta da «perdo il prezzo» a «vedo un prezzo
  che non è quello vero».

⏸ **Non decisa.**

### 3 · ⛔ Un articolo semplice che riceve varianti PERDE la variante anonima

_Domanda del proprietario: «posso avere l'articolo semplice e poi gli creo le varianti?
Questo farebbe saltare il sync con Shopify? È sbagliato come metodo generale?»._

⭐ **Il metodo NON è sbagliato**: «semplice, poi le varianti» è il modello Shopify ed è il
modello VestiFlow. **È l'implementazione della transizione che manca.**

La scheda «Varianti» in anagrafica permette di aggiungere opzioni a un articolo esistente.
Ma la variante anonima non viene convertita: **viene cancellata e ne nascono di nuove** — la
sua chiave sugli assi è vuota, le nuove sono «M», «L», nessuna corrispondenza.

| L'articolo           | Cosa succede                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ha movimenti**     | ⛔ salvataggio **fallisce con 409** «varianti da rimuovere hanno movimenti». L'operatore non ha chiesto di rimuovere niente: il messaggio non gli dice cosa ha sbagliato, e non ha modo di procedere |
| **non ha movimenti** | ⚠️ passa **in silenzio**: con la variante se ne vanno giacenze (`InventoryLevel`, `onDelete: Cascade`), collegamenti fornitore (`Cascade`) e id Shopify                                              |

⭐ **E il sync si spezza da entrambi i lati**: le varianti nuove nascono **senza SKU** («mai
generato in automatico»), e il riaggancio degli id Shopify avviene **solo per SKU** — quindi
le salta. Restano con `shopifyVariantId = null`, e il push delle giacenze si ferma sul
nascere.

⚠️ **Nessun avviso, in nessun punto**: i template della scheda non contengono le parole
«giacenza», «movimenti» o «attenzione».

⏸ **Da decidere**: se questo caso sia frequente nel lavoro reale. Se lo è, viene prima del
prezzo; se è raro, va messo in coda **con un avviso** che almeno impedisca il danno
silenzioso.

### 4 · Tre cose trovate strada facendo

- ⛔ **Un articolo importato da Shopify senza opzioni non è «semplice» per l'anagrafica.** Il
  pull gli dà `optionValues: [{ Title: 'Default Title' }]`, l'anagrafica ne ricava un asse
  «Title», e **al primo salvataggio** scrive `Product.options = [{ Title: [...] }]`. Da quel
  momento quell'articolo smette di essere semplice e il prezzo non si specchia più.
- ⚠️ **Le due guardie «articolo semplice» non coincidono**: il backend guarda
  `options.length === 0`, il client «nessun asse **e** varianti ≤ 1». Un articolo con
  `options: []` e 2+ varianti verrebbe **appiattito** sul prezzo dell'articolo. Non
  producibile dall'interfaccia; **dall'import di catalogo sì**.
- ⚠️ **`shopify_inventory_sync_states` non ha la chiave esterna**: lo schema dichiara la
  relazione, la migration non emette il `FOREIGN KEY`. Cancellata una variante, restano righe
  di stato sync orfane.

### 5 · I test che mancano

Nessuno copre: che il prezzo dell'articolo **nuovo** arrivi a `Product` e `ProductVariant`
(`quick-product-create.util.ts` **non ha un `.spec`**); che parta anche a **spunta spenta**
(la decisione del 02/09, oggi tenuta in piedi solo da dove passa il codice);
`mirrorSimpleProductPrice` (zero occorrenze nei test); e lo **scenario di sequenza** — carico
che cambia il prezzo, poi salvataggio dell'anagrafica — che è quello che perde il dato.

---

**Aggiornato:** 29/08/2026
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

---

## 👁 CONTROLLI VISIVI IN SOSPESO

_Aperta il 02/09/2026 su richiesta del proprietario: «ora non ho la possibilità di
verificare, dobbiamo segnare i controlli visivi sui lavori svolti»._

⛔ **Build verde, lint pulito e test verdi non dicono come una cosa si VEDE.** Le
regressioni di layout non falliscono niente: una riga che non si ancora, una classe rimasta
orfana, un comando che sparisce invece di spegnersi. Qui si accumula ciò che aspetta un paio
d'occhi, e **si cancella la voce quando è stata guardata** — non prima.

⚠️ **Ogni voce dice cosa deve VEDERSI**, non cosa è stato scritto: chi verifica non deve
rileggere il codice per sapere se è giusto.

| #      | Dove                                                                                    | Cosa deve vedersi                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | **qualunque elenco**, trascinando il bordo di una colonna                               | La colonna arriva dove la si rilascia e **ci resta**; le altre cedono spazio senza che compaia una barra orizzontale. ⛔ Prima rimbalzava indietro e al secondo trascinamento **non si muoveva più**                                                                                                                                                                                                                                          |
| 2      | **qualunque elenco**, dopo aver regolato una colonna → **F5**                           | La larghezza è ancora quella. ⛔ Prima spariva a ogni ricaricamento                                                                                                                                                                                                                                                                                                                                                                           |
| 3      | Magazzino → **Inventario** (`/app/inventory/counts`)                                    | Il contenitore delle righe prende **tutta l'altezza** disponibile, e «N voci» sta **in fondo al contenitore** — non appoggiata sotto l'ultima riga col vuoto sotto                                                                                                                                                                                                                                                                            |
| 4      | Magazzino → **Inventario**                                                              | La colonna «Azioni» col cestino **non c'è più**. Selezionando una sessione **annullata**, «Elimina» in barra è attivo; selezionandone una **completata**, è spento e dice perché                                                                                                                                                                                                                                                              |
| 5      | **Dettaglio inventario** (`/app/inventory/counts/:id`)                                  | Ci sono selettore **Colonne** e pulsante **Filtri**; «Contato» è ancora un **campo dove si batte**; il Delta ha segno e colore; le righe con differenza si distinguono                                                                                                                                                                                                                                                                        |
| 6      | **Dettaglio inventario**, scansionando un articolo                                      | La sua riga **si accende per un momento** e la pagina ci scorre sopra se non è già in vista                                                                                                                                                                                                                                                                                                                                                   |
| 7      | **Ordini cliente** (`/app/sales`), scrivania **e** telefono                             | Il menu «···» **non c'è più** in nessuna delle due vesti. Con una riga selezionata, «Duplica» in barra è attivo e apre il duplicato                                                                                                                                                                                                                                                                                                           |
| 8      | **Ordini cliente**, card su telefono                                                    | Il piede della card mostra la sede senza lasciare un vuoto a destra dove stava il menu                                                                                                                                                                                                                                                                                                                                                        |
| 9      | **Ricerca giacenza** (`/app/inventory/lookup`), **da telefono**                         | Scrivendo «mag» non succede niente; alla **terza lettera** compaiono gli articoli da soli, senza premere nulla. Ogni riga ha miniatura, nome, n° taglie, disponibile e prezzo                                                                                                                                                                                                                                                                 |
| 10     | **Ricerca giacenza**, toccando un articolo                                              | Si apre la griglia **taglie × sedi** al posto dei risultati, con «Torna ai risultati» in cima. Toccando un numero si aprono gli ordini che lo impegnano                                                                                                                                                                                                                                                                                       |
| 11     | **Ricerca giacenza**, scansionando un codice                                            | Se il codice porta a un solo articolo, la sua scheda si apre **da sé** senza passare dall'elenco                                                                                                                                                                                                                                                                                                                                              |
| 12     | **Ricerca giacenza**, articolo senza immagine                                           | Al posto della foto c'è l'icona segnaposto, e la riga resta **alta uguale** alle altre — l'elenco non deve ballare mentre si scorre                                                                                                                                                                                                                                                                                                           |
| 13     | **Fattura, Fatt. accompagnatoria, Nota di credito, Proforma** — documento **nuovo**     | Al posto della tabella righe c'è uno **stato vuoto** che dice «Scegli il cliente e la sede». Scelto uno solo dei due, il testo nomina **quello che manca ancora**. Scelti entrambi, compare la tabella                                                                                                                                                                                                                                        |
| 14     | Gli stessi quattro tipi, **da telefono**                                                | Lo stato vuoto compare **al posto delle card**, non insieme a esse. ⛔ Prima la vista compatta era un `@if` separato: si vedevano tutte e due                                                                                                                                                                                                                                                                                                 |
| 15     | Gli stessi quattro tipi, aprendo una **fattura già salvata** priva di sede              | Le righe **ci sono**. Il blocco vale sui documenti nuovi: nasconderle su uno storico renderebbe illeggibile ciò che è già stato emesso                                                                                                                                                                                                                                                                                                        |
| 16     | **Arrivo merce** — testata                                                              | «Aggiorna costo in anagrafica» e «Aggiorna prezzi in anagrafica» stanno nella fascia **«Dati del documento ricevuto»**, accanto a «Seguirà registrazione fattura», ognuna su **una riga sola**. ⛔ Prima erano in fondo alla pagina, in una colonnina, col testo a capo su **quattro** righe                                                                                                                                                  |
| 17     | **Arrivo merce** — piede                                                                | Sotto le righe restano **solo** «Note documento» e «Commento interno». La banda finale è **più bassa** di prima, e il vuoto a destra della testata si è ridotto                                                                                                                                                                                                                                                                               |
| 18     | **Tutte e sei le maschere documento** — piede                                           | Le due caselle di testo sono alte **64px** invece di 96: il piede scende di 32px e li prende il contenitore righe. Le caselle restano **gemelle** (stessa altezza, fondi allineati) e si allargano ancora trascinando l'angolo                                                                                                                                                                                                                |
| 19     | **Arrivo merce, Fatture, Movimento, Trasferimento, Ordine cliente e fornitore** — righe | Il **Tab** gira fra le celle come prima, ←/→ escono ai bordi, ↑/↓ cambiano riga e in fondo ne creano una nuova. ⚠️ È la verifica dei ponti rimossi: 340 righe tolte da sei maschere, il comportamento deve essere identico                                                                                                                                                                                                                    |
| 20     | Le stesse sei, **premendo Tab su una colonna nascosta** dal selettore Colonne           | La colonna spenta viene **scavalcata**, non riceve il fuoco. ⚠️ Era il lavoro del filtro che è sceso dentro lo store                                                                                                                                                                                                                                                                                                                          |
| 21     | **Arrivo merce** — le tre spunte in fascia                                              |
| ~~26~~ | ✅ **Arrivo merce** — la colonna prezzo                                                 | **VERIFICATA dal proprietario il 02/09/2026**: `COSTO NETTO ⌄ · PREZZO IVATO ⌄ · PREZZO SHOPIFY · PREZZO BARRATO`. Una sola colonna prezzo, col chevron, nessun doppione. ⛔ Il selettore era **cablato e morto** dal 24/08 (la testata cercava `unitPrice`, che questa maschera non dichiara), e il primo tentativo di correzione aveva **aggiunto** una colonna invece di sostituirla — visto a schermo dal proprietario prima che dai test |
| 22     | **Ordine fornitore** — riga documento                                                   | Il Tab arriva su **«Cod. fornitore»**. ⛔ Prima si fermava lì e non faceva più niente: lo store cercava l'id `po-suppcode-N` mentre la riga comune rende `po-supplier-code-N`                                                                                                                                                                                                                                                                 |
| 23     | **Fattura, Proforma, Fatt. accompagnatoria, Nota di credito** — cella **U.m.**          | Ci si arriva col Tab da «Q.tà», e si esce col Tab verso «Prezzo». ⛔ Prima era una **trappola**: ci si entrava solo col mouse e non se ne usciva più con la tastiera — Tab, Shift+Tab e le quattro frecce non facevano niente                                                                                                                                                                                                                 |
| 24     | **Fatture, Rettifica, Trasferimento** — con un preset che spegne una colonna            | Aprire «Colonne» → preset **Magazzino** (toglie Prezzo). Il Tab da «Q.tà» **salta alla colonna successiva accesa**. ⛔ Prima si fermava, perché il giro cercava una cella non più nel DOM                                                                                                                                                                                                                                                     |
| 25     | **Arrivo merce** — accendendo la colonna **Descrizione**                                | Il Tab ci passa, fra «Nome prodotto» e «Q.tà». ⛔ Prima la scavalcava in entrambi i versi pur essendo un campo editabile                                                                                                                                                                                                                                                                                                                      |     | Ognuna sta su **una riga di testo**, non a capo. Cliccando l'etichetta si accende la spunta (l'associazione `for`/`id` è stata rifatta a mano dopo un errore di sostituzione) |

---

## ⛔ IL GIRO DEL TAB — quattro difetti, e perché un motore condiviso non basta

_Il proprietario: «il tab ha qualche problema». E poi, alla spiegazione: «ma se è un motore
condiviso, perché può dare problemi altrove?»._

> **Il motore è condiviso. La sua CONFIGURAZIONE no — ed è lì che sono i difetti.**

```text
DocumentLineFocusStore     condiviso ✅   la logica del giro
document-line-row          condivisa ✅   rende le celle e COMPONE gli id
elencoCampi + elementId    ⛔ per maschera, riscritti a mano, sei volte
catalogo colonne           ⛔ un terzo elenco, in un altro file ancora
```

⭐ **Tre elenchi che devono coincidere per convenzione, non per costruzione.** Il contratto
dello store dice «chiede l'id a chi lo conosce», ma **due posti diversi lo conoscono**: la
riga comune lo compone come `${idPrefix}-${alias}-${indice}`, e ogni maschera lo ridichiara.

⚠️ **È lo stesso schema del filtro dei campi corretto lo stesso giorno**: lo store possedeva
già l'elenco, ma la domanda «è mio?» stava fuori, ricopiata sei volte. Qui il dato che sta in
due posti è l'**identificativo DOM**.

### I quattro difetti, tutti PREESISTENTI (verificato con `git`)

| #   | Dove                                            | Cosa succedeva                                                                                                                                                  |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ordine fornitore**, campo «Cod. fornitore»    | Lo store cercava `po-suppcode-N`, la riga comune rende `po-supplier-code-N`. Il Tab **si fermava**: `focusField` tornava `false` e `next()` non guarda l'esito  |
| 2   | **Le quattro maschere Fattura**, cella **U.m.** | **Trappola del fuoco**: colonna accesa di serie, cella editabile, ma `unitOfMeasure` fuori dal giro. Ci si entrava col mouse e non se ne usciva con la tastiera |
| 3   | **Fatture, Rettifica, Trasferimento**           | `isFieldEnabled` non controllava la **visibilità di colonna** — le altre tre lo facevano. Con un preset che spegne una colonna del giro, il Tab si bloccava     |
| 4   | **Arrivo merce**, colonna **Descrizione**       | Campo editabile fuori dal giro: scavalcato in entrambi i versi                                                                                                  |

⚠️ **Nessuno faceva fallire niente**: `getElementById` di un id assente non lancia, e
`focusField` torna `false` a chi non lo legge. Nessun test copriva il giro del fuoco su
quelle maschere.

### Perché la U.m. era una TRAPPOLA e non solo un campo saltato

⭐ La discriminante non è «la cella è editabile»: è **chi annulla l'evento**.

| Cella                                                         | Cosa fa col tasto                        | Fuori dal giro                                                            |
| ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `select-cell` (Codice IVA) e `unit-cell` (U.m.), che la monta | `preventDefault()` **da sé**, poi emette | ⛔ **trappola**: il Tab nativo è già annullato e lo store scarta l'evento |
| `<input>` semplice (Costo, Prezzo, Prezzo barrato)            | emette e basta                           | ✅ nessun danno: resta il Tab del browser                                 |

⚠️ È il motivo per cui `sellingPrice` e `compareAtPrice` dell'**Ordine fornitore**, pur
essendo fuori dal giro, **non sono un difetto** — e per cui la guardia è stata ristretta:
una che segnala falsi positivi viene spenta.

### Le due guardie

- **`check:id-fuoco`** — confronta gli id che lo store CERCA con quelli che la riga comune
  RENDE. 58 campi su sei maschere.
- **`check:colonne-nel-giro`** — una colonna resa da una cella che annulla l'evento deve
  stare nel giro della maschera che la dichiara. Vale anche per le colonne **spente di
  serie**: si accendono dal selettore, e lì la trappola compare.

Entrambe falsificate reintroducendo il guasto vero.

⏸ **La correzione alla radice resta da valutare**: far DERIVARE l'elenco dei campi e la mappa
id dal catalogo colonne, invece di riscriverli. Toglierebbe la classe intera di difetti, ma
tocca il contratto condiviso di sei maschere.

---

## 🔎 LE DISCREPANZE FRA LE OTTO MASCHERE — censite il 02/09/2026

_Il proprietario: «a breve faremo un lavoro di ristrutturazione visiva comune, per questo
motivo voglio che tu completi queste discrepanze che esistono nei nuovi documenti quando
non sono giustificate da logiche che portano per forza a diversificare»._

⭐ **L'Arrivo merce usa tutti e tredici i pezzi condivisi.** È il riferimento, e non per
caso: `_document-form.scss` nasce come suo foglio, poi promosso al livello globale.

```text
                    1  2  3  4  5  6  7  8  9 10 11 12 13   scss  righe TS
Arrivo merce        X  X  X  X  X  X  X  X  X  X  X  X  X   NO     5.641
Registr. fattura    X  X  .  X  X  X  X  .  X  .  .  .  X   sì     1.840
Fatture (4 tipi)    X  X  X  X  X  .  X  X  X  .  X  .  .   sì     3.597
Movimento           X  X  X  X  X  .  X  X  X  .  X  .  X   sì     1.982
Trasferimento       X  X  X  X  X  .  X  X  X  .  X  .  .   sì     1.991
Ordine cliente      X  X  X  X  X  .  X  X  X  X  X  .  .   sì     5.709
Ordine fornitore    X  .  X  X  .  .  X  X  X  .  X  .  .   sì     2.981
Vendita al banco    X  .  X  X  .  .  X  .  X  .  .  .  .   sì     2.295

1 testata · 2 note · 3 riga comune · 4 stati di pagina · 5 avviso precompilazione
6 controparte · 7 cella testata · 8 giro del fuoco · 9 numerazione · 10 pannello prodotti
11 ricerca per codice · 12 allegati · 13 stampa
```

### Le assenze, e quali sono giustificate

| Assenza                                   | Verdetto                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **riga comune** — Registrazione fattura   | ✅ **giustificata**: le sue righe sono CONTABILI (Importo · IVA · Descrizione), non articoli                                                                                                              |
| **giro del fuoco** — Vendita al banco     | ✅ **giustificata**: al banco si scansiona, non si tabula fra colonne (`commitScan` su Invio)                                                                                                             |
| **ricerca per codice** — Registr. fattura | ✅ **giustificata**: stesso motivo della riga comune                                                                                                                                                      |
| ⏸ **area note** — Ordine fornitore        | **da decidere**: il modello `SupplierOrder` non ha le colonne. Non è un buco della maschera — è che il dominio non le prevede. Aggiungerle è una decisione di prodotto con migration, non un allineamento |
| ⏸ **allegati** — sei maschere su otto     | li hanno solo Arrivo merce e Registrazione fattura. Da capire se è una scelta o un arretrato                                                                                                              |
| ⏸ **stampa** — cinque su otto             | idem                                                                                                                                                                                                      |

### Discrepanze già chiuse il 02/09/2026

- ⭐ **Il filtro dei campi di riga** (`campoDiQuestoDocumento`) era ricopiato in **sei**
  maschere insieme a otto metodi-ponte identici: **340 righe** che rigiravano l'evento allo
  store del fuoco. Il filtro è sceso dentro `DocumentLineFocusStore`, che possiede già
  l'elenco dei campi, e i template chiamano lo store direttamente.
- ⭐ **L'elenco dei campi era scritto DUE volte per maschera** — la costante che definisce il
  tipo, e i `fields` passati allo store. Dovevano coincidere a mano: se divergevano, il
  filtro lasciava passare un campo che il giro non conosce, **in silenzio**. Ora la costante
  alimenta i `fields`. L'Arrivo merce lo faceva già: la forma esisteva, non l'aveva estesa
  nessuno.
- ⭐ **L'altezza delle caselle note era dichiarata due volte** (64px nella base, 96px nel
  piede) e la seconda sforava il tetto di `regole-stile-ui` §7 («max ~90px»). Ora una sola.

### 🗺 QUALI SONO LE OTTO MASCHERE, e cosa apre ognuna — 02/09/2026

_Il proprietario: «dimmi anche quali sono queste 8 e vediamo se devono rientrarci altri
documenti»._

> **Le otto coprono tutti i 17 tipi che hanno una maschera. Nessuno resta fuori.**

Elenco autorevole: `DOCUMENT_ROW_OPENS` in `document-routing.util.ts`, che è un `Record`
esaustivo per tipo — aggiungerne uno senza dichiararlo non compila.

| Maschera                   | Tipi che apre                                                                      | N   |
| -------------------------- | ---------------------------------------------------------------------------------- | --- |
| `customer-order-form`      | Ordine cliente · Preventivo · DDT vendita · **Vendita manuale**                    | 4   |
| `sales-document-form`      | Proforma · Fattura · Fatt. accompagnatoria · Nota di credito                       | 4   |
| `goods-receipt-form`       | Arrivo merce · Carico manuale · Carico iniziale                                    | 3   |
| `store-sale-document-form` | Vendita al banco · Reso al banco                                                   | 2   |
| `purchase-invoice-form`    | Registrazione fattura fornitore                                                    | 1   |
| `stock-operation-form`     | Rettifica                                                                          | 1   |
| `transfer-form`            | Trasferimento                                                                      | 1   |
| `supplier-order-form`      | Ordine fornitore                                                                   | 1   |
| —                          | **Inventario fisico**: nessuna maschera, flusso proprio in `/app/inventory/counts` | 1   |

⭐ **La mappa spiega le dimensioni.** `customer-order-form` ha 5.709 righe e sei fogli SCSS
perché fa **quattro mestieri diversi**: un ordine che impegna, un preventivo che non impegna,
un DDT che scarica, e una Vendita manuale che scavalca il motore dei movimenti. Non è
disordine gratuito.

⏸ **`stock-operation-form` (1.982 righe) e `transfer-form` (1.991) portano UN tipo ciascuna**,
e sono due operazioni di magazzino quasi gemelle. È la discrepanza di dimensione meno
giustificata delle otto: da guardare quando si affronta l'unificazione vera.

### 🔎 CONTENITORE PAGINA e TESTATE — censiti il 02/09/2026

_Il proprietario: «questo mi fa capire che probabilmente il contenitore pagina e testate
documenti non siano condivisi o in comune; tecnicamente non so come debbano essere, ma molti
differiscono tra loro e senza motivo»._

#### ✅ Il contenitore pagina È comune — e non era questo il problema

Tutte e otto aprono con `<section class="doc-form doc-form--m-ref">`. L'unica che aggiunge
qualcosa è l'**Ordine cliente**, con `co-form`.

#### ⛔ Ma il CSS proprio è distribuito in modo molto disuguale

```text
globale condiviso                        3.356 righe   _document-form (2.473)
                                                       _document-form-mobile (620)
                                                       _document-form-footer (263)

proprio, SETTE maschere insieme            381 righe
proprio, SOLO l'Ordine cliente           1.097 righe   ← quasi il TRIPLO delle altre sette
```

| Maschera           | Fogli | Righe     |
| ------------------ | ----- | --------- |
| **Ordine cliente** | **6** | **1.097** |
| Registr. fattura   | 1     | 138       |
| Vendita al banco   | 1     | 95        |
| Ordine fornitore   | 1     | 65        |
| Fatture            | 1     | 52        |
| Movimento          | 1     | 21        |
| Trasferimento      | 1     | 10        |
| **Arrivo merce**   | **0** | **0**     |

⚠️ **I due estremi raccontano due storie opposte.** L'Arrivo merce non ha foglio perché il
suo è stato **promosso** a `_document-form.scss`: è il riferimento. L'Ordine cliente ne ha
sei, e i nomi dicono che sono strati sovrapposti nel tempo — `mobile.scss`,
`mobile-cards.scss`, `mobile-polish.scss`, `reference-mobile.scss`: **quattro fogli per la
sola vista mobile**, di una maschera sola.

⏸ **Da decidere prima della ristrutturazione**: quanto di quelle 1.097 righe è dominio
dell'Ordine cliente e quanto è aspetto che dovrebbe stare nel livello comune. È il singolo
blocco che più può divergere dalla ristrutturazione visiva, perché è quello che il livello
comune non governa.

#### ⛔ La testata comune è configurata in tre modi diversi

`app-document-header` lo usano **tutte e otto** ✅. Ma:

```text
con [flowRow]="true"   Arrivo merce (fascia 1) · Registr. fattura · Fatture (fascia 1 e 2)
senza                  ARRIVO MERCE (FASCIA 2) · Movimento · Trasferimento
                       Ordine fornitore (×2) · Vendita al banco
```

⚠️ **`flowRow` decide se la fascia si distende** (flex a quote proporzionali) **o resta una
griglia a una colonna**. Non esiste una regola che dica quando si usa: cinque maschere su
otto non lo passano, e non è dichiarato se sia una scelta o un'omissione.

⛔ **La fascia 2 dell'Arrivo merce è l'unica combinazione del suo genere in tutto il
progetto**: un `document-counterparty-ref` in modalità fascia, dentro un `app-document-header`
**senza** `flowRow`. Le Fatture, che pure hanno due fasce, passano `flowRow` a entrambe e non
usano il counterparty-ref. È la combinazione che si vede rotta a schermo (fascia larga ~560px
su 1744, celle impilate a due per riga).

#### ✅ LA CAUSA, misurata in un browser vero e CORRETTA — 02/09/2026

> **La fascia non era «stretta»: era un grid item in UNA colonna su TRE.**

```text
div .doc-form__grid--header   1041px   grid → 336.328px 336.328px 336.344px   ← tre colonne
  ├ fieldset (contents)          0
  ├ counterparty-ref (contents)  0
  └ div .doc-form__header-row--secondary   336px   ← occupava UNA colonna
```

La causa è in `_document-form.scss` riga ~427:

```scss
@include bp.media-up('md') {
  .doc-form__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

⭐ **I numeri combaciano al decimale**: `(1041 − 2 × 16 di gap) / 3 = 336,3px`.

⛔ **Tre tentativi di fila hanno mancato il bersaglio**, e la ragione è una sola: su un grid
item `inline-size: 100%` vale il 100% **della sua colonna**, non del contenitore. Solo
`grid-column` cambia quante colonne occupa. Nessuna delle tre correzioni poteva funzionare,
e nessuna faceva fallire build, lint o i 3.212 test.

⭐ **La fascia 1 non ha mai avuto il problema** perché riceve `[flowRow]`, che porta il
contenitore a `display: flex` e rende le colonne irrilevanti.

✅ **Correzione**: `grid-column: 1 / -1` nel foglio di `document-counterparty-ref`, cioè nel
componente che rende la fascia. Vale anche per la **Registrazione fattura**, che usa lo
stesso componente nella stessa forma. **Verificata a schermo dal proprietario.**

⚠️ **La lezione, e vale oltre questo caso**: quattro letture del CSS non hanno trovato una
causa che una misura in un browser ha dato in dieci secondi. Per un difetto di layout la
prima mossa è misurare la catena reale, non dedurla — le regole possono essere tutte giuste
e il risultato sbagliato lo stesso.

#### ⏸ E resta il censimento: 29 componenti condivisi su 77 senza `display`

`app-document-header` non dichiara il proprio `display`, quindi il suo host è `inline`. Non
era **questa** la causa della fascia, ed è stato dichiarato comunque (`display: block`)
perché un componente che rende struttura deve essere un blocco.

Censito il 02/09/2026 su `domain/documents/components` e `shared/components`:

```text
48 dichiarano il display sull host
29 NO   — fra cui document-header, document-header-field, document-header-group,
          document-line-row, document-line-head, document-totals
```

⚠️ **Non tutti ne hanno bisogno**: un dialogo o un toast sono `position: fixed` e l'host
inline non conta. Ma i sei nominati qui sopra rendono **struttura** — fasce, celle di
testata, righe — e per loro l'host inline è una mina che esplode solo in certe combinazioni,
come è appena successo.

⏸ **Da fare prima della ristrutturazione visiva**: passarli uno a uno e dichiarare il
display che ognuno deve avere (`block`, `contents`, o `flex`). È lavoro piccolo e a rischio
basso, ma va fatto **guardando a schermo**: cambiare il display di un componente condiviso
cambia come si dispone in ogni maschera che lo usa.

### ⛔ LE TESTATE: sette maschere su otto non dimensionano i campi

_Il proprietario: «le discrepanze che più mi preoccupano sono sul contenitore delle righe,
sulle colonne e sulle testate»._

> **`--doc-field-min` dà a una cella di testata la misura del suo dato. Lo impostava
> l'Ordine cliente, e nessun altro.**

```text
customer-order-form    3 celle dimensionate sul dato
le altre SETTE         0
```

La fascia legge `flex: 1 1 var(--doc-field-min, var(--field-w-md))`: senza il canale, ogni
cella vale **176px** — una data larga quanto una ragione sociale — e la fascia **va a capo**
prima del necessario, lasciando il vuoto a destra che il proprietario ha cerchiato
sull'Arrivo merce.

⛔ **Il meccanismo esiste dal giorno in cui la fascia è passata a flex**, e il commento nel
foglio lo dava per risolto: «ora il minimo di un campo è la misura del suo dato, dichiarata
dal campo stesso». Dichiarata da **una** maschera.

✅ **Chiuso per l'Arrivo merce il 02/09/2026**: le tre celle di
`document-counterparty-ref` (tipo, numero, data) si dimensionano nel proprio foglio — è il
componente a sapere cosa contengono — e le quattro celle proiettate dalla maschera
(Pagamento e le tre spunte) con `style`, come fa l'Ordine cliente. Il knob è ora dichiarato
nella tabella dei punti di regolazione di `regole-stile-ui`.

⏸ **Restano sei maschere**: Registrazione fattura, Fatture, Movimento, Trasferimento,
Ordine fornitore, Vendita al banco. Ognuna va guardata a schermo dopo l'intervento — è una
taratura visiva, non una sostituzione meccanica.

### ⏸ Resta duplicato, e non è ovvio dove appartenga

Tre ponti dei **suggerimenti**, ancora identici in cinque maschere:
`onRowSuggestionNavigated`, `onProductSuggestionNavigate`, `onRowSuggestionPicked`
(~23 righe × 4 copie). ⚠️ Non passano dallo store del fuoco: parlano al pannello
suggerimenti, che ha uno store proprio. Vanno guardati con lo stesso criterio — «chi
possiede il dato risponde alla domanda» — ma la risposta non è la stessa e va verificata.

---

## 📏 LE SETTE MASCHERE DOCUMENTO: quanto è già unificato — misurato il 02/09/2026

_Il proprietario, guardando le righe di una fattura: «anche l'intera pagina di contenitore
dei nuovi documenti potrebbe essere condivisa senza duplicati? sarebbe meglio?». E poi,
guardando l'Arrivo merce: «ci sono documenti che sono ancora diversi e quindi sembra strano
che sia tutto condiviso»._

> **È già condivisa al 91%. Quello che resta nelle maschere non è duplicazione: è la
> configurazione del singolo documento.**

```text
23.324 righe di TS in sette maschere
   658 import su 721  (91%)  vengono da @domain / @shared / @core
```

| Maschera           | Righe | Import da livelli condivisi |
| ------------------ | ----- | --------------------------- |
| `customer-order`   | 5.777 | 124 / 133                   |
| `goods-receipt`    | 5.686 | 119 / 135                   |
| `sales-document`   | 3.653 | 103 / 112                   |
| `store-sale`       | 2.294 | 80 / 86                     |
| `transfer`         | 2.042 | 83 / 90                     |
| `stock-operation`  | 2.033 | 82 / 90                     |
| `purchase-invoice` | 1.839 | 67 / 75                     |

### Che cosa resta duplicato, diviso per quanto costa deciderlo

Misurati i membri di classe presenti in **almeno tre** maschere:

```text
157 membri condivisi da 3+ maschere
 51 IDENTICI parola per parola   →  ~615 righe    unificabili senza decisioni
106 DIVERGENTI                   →  ~4.201 righe  ma quasi tutti sono CONFIGURAZIONE
```

⛔ **Il numero grosso inganna, e va letto prima di usarlo.** I «divergenti» più costosi non
sono logica ricopiata: sono la dichiarazione di _questo_ documento, che per forza differisce.

| Membro                  | ×   | Forme | ~Righe | Che cos'è davvero                                          |
| ----------------------- | --- | ----- | ------ | ---------------------------------------------------------- |
| `lineFocus`             | 5   | 5     | 51     | **configurazione**: campi e id di `DocumentLineFocusStore` |
| `form`                  | 4   | 4     | 61     | **configurazione**: i campi del documento                  |
| `numbering`             | 4   | 4     | 32     | **configurazione** di `DocumentNumberingStore`             |
| `persist`               | 3   | 3     | 99     | logica vera, ma solo ×3                                    |
| `constructor`           | 4   | 4     | 82     | avvio: in parte logica, in parte cablaggio                 |
| `patchFormFromDocument` | 5   | 5     | 25     | logica vera, cinque forme distinte                         |

⭐ **`DocumentLineFocusStore` è già in `domain/documents/state/`**: le cinque «forme
divergenti» di `lineFocus` sono cinque elenchi di campi, non cinque copie di un motore. È il
motivo per cui la misura grezza va classificata prima di essere usata come arretrato.

### L'unico blocco sicuro da unificare, e perché non è stato fatto

Otto metodi, **identici parola per parola in cinque maschere** — il giro del fuoco fra le
celle di riga e la scelta dai suggerimenti:

```text
onRowSuggestionNavigated  ×5      onRowFieldKeydown   ×5      onRowLineAdvance  ×5
onProductSuggestionNavigate ×5    onRowFieldAdvance   ×5      onRowLineRetreat  ×5
onRowSuggestionPicked     ×5      onRowFieldRetreat   ×5
```

⚠️ **Sono PONTI, non logica**: tre-nove righe che passano dal template allo store condiviso.
Unificarli vale **~212 righe su 23.324 (0,9%)** e richiede di toccare **cinque template**,
perché è il template a chiamarli per nome.

⏸ **Non fatto: il rapporto fra rischio e guadagno va deciso dal proprietario**, non dedotto.
Le tre strade, se si decidesse di farlo: classe base astratta (tocca il meno possibile ma
introduce ereditarietà dove oggi c'è composizione), un helper esposto come proprietà (il
template chiama `righe.avanza(i, campo)`), o una direttiva sulla tabella.

---

## ⭐ L'AVVISO DI DISPONIBILITÀ — deciso il 02/09/2026

_Il proprietario, guardando la cella Q.tà: «potremmo anche toglierlo, il testo intendo, e
segnalare la casella col colore dell'avviso, così ad occhio capiscono della disponibilità.
Diversamente da mobile che bisogna valutare»._

> **Su SCRIVANIA l'avviso si legge dal COLORE della cella. Su MOBILE resta scritto.**

⭐ **Il colore c'era già e diceva la stessa cosa**: cella con fondo ambra, input con bordo e
testo ambra. Il testo dentro la cella era la **terza copia** dello stesso segnale, e nella
colonna più stretta della riga andava a capo — una seconda riga di testo per ogni riga in
eccesso, su una tabella densa.

⚠️ **Il dato non si perde**, che è ciò che `regole-gestionale` chiede — «mai un valore
leggibile solo dal colore»:

|                               |                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **col mouse**                 | il `title` sull'input dice «disponibili solo N» — c'era già                                                           |
| **con un lettore di schermo** | uno `sr-only` nella cella                                                                                             |
| **su mobile**                 | il testo **per esteso** nella card (`document-line-card`), dove non c'è passaggio del mouse e lo spazio verticale c'è |

### ⛔ E con lui cade la ragione dei 72px

Il catalogo dell'Ordine cliente diceva: «Q.tà ospita l'avviso: qualche pixel in più a lei».
**Falso**, e per tre ragioni indipendenti:

```text
lo STESSO commit (23/07) fa andare a capo l'avviso   white-space: normal · overflow-wrap: anywhere
la tabella è table-layout: fixed                     il contenuto non decide MAI la larghezza
dal 02/09 nella riga il testo non c'è più            resta il colore
```

⚠️ **La misura si era propagata per ereditarietà**: DDT vendita e Vendita manuale derivano da
quel catalogo, e il **Preventivo** eredita i 72px pur essendo l'unico documento che quell'avviso
non lo mostra mai. Il commento è stato corretto sul posto, lasciando scritto cosa diceva di
sbagliato.

⏸ **La larghezza canonica di `quantity` resta da decidere** — sei valori su sei cataloghi,
dichiarati in `DIVERGENZE_NOTE`. Il punto acquisito è che **non si decide guardando l'avviso**.

### ✅ Il testo, unificato

⛔ La Vendita al banco aveva una **terza copia** del messaggio, lunga sei volte l'originale —
«Quantità superiore alla disponibilità. Giacenza X, impegnata Y, disponibile Z. Si può
concludere comunque.», centosette caratteri dentro una colonna da ottanta pixel — e
contraddiceva il commento della funzione comune: «il messaggio, in un posto solo: due copie
divergono, e si vede tardi». Erano già divergenti. Ora passa da `availabilityHintText`.

### 🔴 Da fare: la colonna disponibilità dove serve

_Il proprietario: «la colonna disponibilità va prevista ovunque serva. Lo scarico e la
rettifica agisce direttamente sulle giacenze. Anche trasferimento, ma qui bisogna trattarlo
quasi come un documento come info contenute, l'operatore deve sapere cosa sta trasferendo»._

⛔ **Oggi Scarico, Rettifica e Trasferimento documentali tolgono merce e non avvisano
affatto**: né avviso né colonna disponibilità (`stock-operation-form`, `transfer-form`: zero
occorrenze di `availabilityHint`). È la stessa famiglia di difetti della Fattura
accompagnatoria, corretta il 26/08.

|                             |                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scarico** · **Rettifica** | agiscono **direttamente** sulle giacenze: la disponibilità è il dato che governa il gesto                                                            |
| **Trasferimento**           | ⭐ **va trattato «quasi come un documento»**: l'operatore deve sapere **cosa sta trasferendo**, non solo quanto — quindi più di una colonna numerica |

⚠️ **Un difetto vicino, da correggere insieme**: l'Arrivo merce **dichiara** `stockAvailable`
e nessuno lo popola — accendendo quella colonna si ottengono celle vuote.

---

## 🔴 COMPLETARE LE COLONNE — riepiloghi e nuovi documenti

_Chiesto dal proprietario il 02/09/2026: «completiamo le colonne sia nei riepiloghi che nei
nuovi documenti»._

**Lo stato è misurato** dal censimento del 02/09/2026 (42 schermate, ogni area verificata da
un secondo agente incaricato di smentire il primo).

### Già a posto — 18 schermate

Undici elenchi sul motore comune più sette maschere documento: selettore Colonne, filtri di
colonna e **larghezze che si conservano** (`14` §22.3).

### ⏸ I riepiloghi che restano fuori

| Schermata                                                                     | Cosa manca   | Nota                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registro Corrispettivi**                                                    | le larghezze | ⚠️ La vista è **già registrata** e la visibilità colonne già si salva: manca solo che `corrispettivi-orders-table` passi `[viewId]` al motore. Una riga — ma accende anche i **filtri di colonna**, che lì oggi non ci sono: è una decisione, non un allineamento |
| **Utenti · Codici IVA · Sedi** (Impostazioni)                                 | tutto        | tabelle proprie. `regole-stile-ui` le dichiarava già come «non ancora nel motore»                                                                                                                                                                                 |
| **Scorte basse · Vendite recenti** (Dashboard)                                | tutto        | idem                                                                                                                                                                                                                                                              |
| **Riepilogo per sede** · **Dettaglio ordine online** · **Pannello analytics** | tutto        | tabelle proprie                                                                                                                                                                                                                                                   |
| **Varianti prodotto** · **Fornitori collegati** (scheda articolo)             | tutto        | dentro l'anagrafica, non elenchi autonomi                                                                                                                                                                                                                         |
| **Importazione prodotti** · **Importazione inventario**                       | —            | ⛔ **decise fuori** il 02/09: sono flussi di passaggio, le preferenze lì non tornano indietro a nessuno                                                                                                                                                           |

### ⏸ I nuovi documenti

| Maschera                                                                                                      | Stato                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Arrivo merce · DDT/Fatture · Movimento · Trasferimento · Ordine fornitore · Ordine cliente · Vendita al banco | ✅ colonne e larghezze (`createLineColumnWidths`, dal 24/08) |
| **Registrazione fattura**                                                                                     | ⏸ **non è lo stesso caso** — vedi sotto                      |

### ⭐ I sei cataloghi colonne: cosa vale unire — analisi del 02/09/2026

_Il proprietario: «massima attenzione a quelle nei documenti, devi vedere se sono condivise e
se e quali vale la pena unire, **forse nessuno perché hanno logiche diverse le righe**»._

**Confrontati tutti e sei colonna per colonna**, col comportamento di ognuna letto nella
maschera che la usa, e la proposta passata a tre lenti incaricate di demolirla (cosa si
perde, quanto costa, quali divergenze sono difetti).

> **L'ipotesi regge, e il fatto è più forte di come è stata formulata: non è che i cataloghi
> abbiano logiche diverse — è che NON CONTENGONO LOGICA.**

I sei file dichiarano **91 voci** per **31 concetti**, e il vocabolario **è già unico**:
`DOCUMENT_LINE_COLUMNS` con il tipo `DocumentLineColumnId`, che impedisce di inventare un id.
Quello che i cataloghi contengono è id, etichetta e larghezza. La logica sta già tutta nel
motore condiviso.

```text
11 concetti su 31  (35%)  appartengono a UN SOLO documento
17 su 31           (55%)  stanno in al massimo due
```

⛔ **E il comportamento editabile / sola-lettura non è nel catalogo**: lo decide
`haControllo(name)` in `document-line-row` — cioè se il form di quel documento ha quel
controllo. `sellingPrice` e `compareAtPrice` hanno id, etichetta e larghezza quasi identici
fra Arrivo merce e Ordine fornitore, e sono **editabili nel primo, in sola lettura nel
secondo**. Unire i cataloghi non toccherebbe questo di un millimetro.

#### ⛔ Perché la SELEZIONE non si unisce — e c'è un precedente misurato

Quali colonne ogni documento dichiara è il **90% del contenuto** dei sei file. Unirla
sposterebbe soltanto il punto in cui si sceglie il sottoinsieme, da un file di configurazione
a un elenco di id dentro un componente.

⚠️ **E il costo non è ipotetico**: il 24/08/2026 l'aggiunta di `loadsStock` a un catalogo
comune ha prodotto **due colonne «Imp.»** sull'Ordine cliente — la sua `commitsStock` più una
`loadsStock` che non dichiara. Da lì viene la prima riga di `isLineColumnVisible` in tre
maschere: «una colonna è visibile solo se QUESTO documento la dichiara». La selezione
separata non è un residuo storico: è la guardia contro un difetto già accaduto.

#### ⭐ Le tre cose che invece vale unire, e la scoperta che le motiva

⛔ **La `label` del catalogo NON è mai l'intestazione che l'operatore legge.**
`document-line-head` cabla le proprie stringhe (SKU, EAN, Articolo, Variante, Q.tà, U.M.,
Seriali, Azioni), e `{{ row.label }}` è letto **in un solo punto di tutta l'app**: il
selettore Colonne.

⚠️ **Il che produce un difetto visibile oggi**: l'operatore accende «Quantità» nel selettore
Colonne, e sulla colonna trova «Q.tà». Accende «U.m.» e trova «U.M.».

| Da unire                                             | Perché                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **le etichette**, col modello di `column-catalog.ts` | ⭐ La forma canonica **non va scelta**: è già scritta nella testata condivisa. Non si mettono d'accordo sei file fra loro — se ne allineano sei a un settimo che ha già ragione. Con `fisso: true` la divergenza diventa **impossibile da scrivere**, invece che segnalata da una guardia   |
| **`numeric` e `filter`**                             | `numeric` è proprietà del **dato**, non del documento — dichiararla sei volte è sei occasioni di sbagliarla e zero di deciderla. `filter` va con lei per la ragione opposta: nella riga documento è **inerte** (nessun controllo di filtro reso), eppure una guardia lo confronta fra i sei |
| **le larghezze delle colonne d'identità**            | `articleCode`, `sku`, `barcode`, `unitOfMeasure` sono **già identiche** ovunque. ⚠️ Ma come default **sovrascrivibile**: `product` va da 240 a 300px, e la ragione è scritta — senza prezzo, sconto e IVA quella riga ha spazio da dare al nome. Non è divergenza, è adattamento            |

#### ⏸ Da fare: la mappa «quale colonna è condivisa CON CHI»

_Chiesto dal proprietario il 02/09/2026: «altro controllo da fare dopo è se le colonne sono
condivise e se possono esserlo e con chi»._

⭐ **Metà della risposta c'è già** dall'analisi qui sopra: il vocabolario **è** condiviso —
`DOCUMENT_LINE_COLUMNS` con il tipo `DocumentLineColumnId`, 31 concetti, e nessun documento
può inventarne uno. E la distribuzione è misurata:

```text
6 id in tutti e sei     sku · barcode · product · variantLabel · quantity · actions
3 in cinque             articleCode · discount · vat
2 in quattro            unitOfMeasure · lineTotal
3 in tre                serials · unitPrice · stockAvailable
6 in due                supplierCode · unitCost · sellingPrice · compareAtPrice · loadsStock · commitsStock
11 in UNO SOLO          description · poOrdered · poReceived · poRemaining · shopifyPrice ·
                        lot · expiry · stockOnHand · discountedCost · purchaseCost · discountedPrice
```

⏸ **Quello che manca è la mappa nominale**: per ciascuno dei 31, quali documenti la
dichiarano e con quale comportamento — così si vede a colpo d'occhio chi condivide cosa con
chi, invece di leggere sei file.

⚠️ E la domanda «**possono** esserlo» ha già un vincolo noto: il comportamento
editabile/sola-lettura **non sta nel catalogo** ma in `haControllo(name)`, quindi due
documenti possono dichiarare la stessa colonna e renderla in modi diversi. La mappa deve
dirlo, o suggerirebbe unificazioni che non stanno in piedi.

#### Le quattro divergenti, guardate una per una — 02/09/2026

⛔ **Delle quattro segnalate dall'analisi, solo UNA era un difetto.** Le altre tre sono
decisioni, o un caso più profondo. È il motivo per cui vanno aperte una per una invece di
allinearle in blocco.

| Colonna                               | Esito                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`quantity`**                        | ✅ **allineata a «Q.tà»** — la testata ha una forma sola (`<span title="Quantità">Q.tà</span>`), e i cataloghi che dicevano «Qtà» e «Quantità» sono passati a lei. Due righe di diff                                                                |
| **`commitsStock`** · **`loadsStock`** | ⛔ **non sono difetti: sono decisioni, e sono scritte nel codice.** La testata non cabla quelle etichette, le **riceve** (`stockToggleLabel`), e il commento dice perché: «lo stesso campo dice _Carica giacenze_ su un reso e _Scarica_ su un DDT» |
| **`product`**                         | ⏸ **resta aperta, e la ragione è un'altra da quella che sembrava**                                                                                                                                                                                  |

##### ⛔ `product`: la testata diverge DA SÉ

Stavo per allineare i cinque cataloghi a «Articolo», sulla premessa che la testata condivisa
avesse già la forma canonica. **La premessa è falsa**, e va scritta perché è il genere di
errore che si ripete:

```text
document-line-head, colonna «product»
  ordinabile        <button>  «Nome prodotto»     riga 140
  non ordinabile    <span>    «Articolo»          riga 151
```

La stessa colonna, nella stessa testata, con due parole diverse a seconda che sia ordinabile.

⭐ **Quindi la forma canonica non esiste ancora**: allineare i cataloghi all'una o all'altra
sceglierebbe per il proprietario invece di chiedergli. Prima si decide **che parola porta
quella colonna**, poi si allineano sei cataloghi **e due rami della testata**.

⚠️ Il ripristino è stato chirurgico: la Vendita al banco è tornata a «Articolo» — l'unica che
lo diceva — invece di restare uniformata per sbaglio.

⭐ **La lezione di metodo**: «la testata ha già ragione» era un'ottima ipotesi e reggeva per
`quantity`. Per `product` no, e a smentirla è bastato leggere le dodici righe intorno
all'etichetta invece della sola etichetta.

---

### ⛔ Registrazione fattura: NON è «l'ottava rimasta indietro»

⚠️ **Qui c'era scritto il contrario** — «sette maschere su otto hanno lo stesso sistema e la
ottava no, non c'è una decisione da prendere, solo da allinearla». **Sbagliato**, e corretto
il 02/09/2026 aprendo il template invece di fidarsi del censimento.

> **Quella maschera non ha righe ARTICOLO: ha righe CONTABILI.**

```text
righe articolo (le altre sette)   codice · articolo · quantità · prezzo · sconto · IVA · totale…
Registrazione fattura             Importo · IVA · Importo IVA · Descrizione
```

Registra gli **importi di una fattura fornitore ricevuta**, non la merce: non c'è un
articolo, non c'è una quantità, non c'è un magazzino da muovere. Ha anche una seconda
tabella — le **rate** (Data scadenza · Importo · Saldato · Data saldo) — che nelle altre
maschere non esiste affatto.

⭐ **Con quattro colonne tutte necessarie, un selettore Colonne non ha niente da offrire**:
quale si spegnerebbe, l'IVA? La descrizione? E le larghezze si conservano per chi trascina,
ma su quattro colonne che stanno già tutte in riga nessuno trascina.

⏸ **Resta da decidere**, e la domanda giusta è un'altra: se convenga dare **alle rate** o
alla riga contabile qualcosa del motore comune — non se «allinearla alle altre sette».

---

## 🧹 CODICE MORTO — `product-review-step`, e la lezione che porta con sé

_Trovato dal censimento del 02/09/2026, mentre si misurava lo stato delle tabelle. Il
proprietario ha chiesto di «analizzare bene, vedere cos'era e decidere se pulire in modo
controllato»._

### Cos'era, e da quando non serve

|                 |                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cos'era**     | il passo **«Riepilogo»** del wizard di creazione prodotto: mostrava in sola lettura dati generali, opzioni e varianti generate **prima di salvare**. Presentazionale, nessuna logica |
| **Nato**        | 08/06/2026 — `b7512885`, «add review step with full product summary»                                                                                                                 |
| **Orfano da**   | **19/07/2026** — `c3abd6db`, «anagrafica prodotto a 4 tab»: il wizard a passi è stato sostituito, e con lui il passo di revisione                                                    |
| **Quanto pesa** | quattro file (ts, html, scss, spec)                                                                                                                                                  |

⭐ **La funzione non è stata persa: è stata sostituita.** Con le quattro schede si vede tutto
mentre si compila, quindi un riepilogo prima del salvataggio non ha più un momento in cui
servire. Togliere il componente non toglie niente all'operatore.

⭐ **E non produce cascata**: le cinque util che importa — `selectedOptionValue`,
`variantOptionNames`, `productStatusLabel`, `productStatusTone`, `moneyFromMajor` — sono
usate da tre a cinque altri file ciascuna. Si porta via solo se stesso.

### ⛔ Perché nessuno se n'era accorto per 45 giorni

> **Ha un proprio `.spec.ts`, e quei test passano.**

⚠️ **È il caso più insidioso del codice morto**, e vale la pena scriverlo perché si
ripeterà: un file provato sembra un file vivo. La suite è verde, la copertura lo conta, e
nessun controllo distingue «provato» da «usato». Gli altri tre passi del wizard —
`product-general-step`, `product-options-step`, `product-variants-step` — sono invece
ancora montati dall'anagrafica: la differenza non si vedeva da nessuna parte.

⚠️ **Le regole di progetto danno 30 giorni** («Codice non toccato»: rimuovi entro 30 giorni
dall'identificazione, con `ts-prune` o equivalente). Nessuno strumento del genere gira in
CI, ed è per questo che la scadenza non è mai scattata.

### Non era solo, ed erano quattro — censimento del 02/09/2026

Cercato in tutto il repository (componenti, servizi, util, API, stili), con un verificatore
per famiglia incaricato di **smentire** i ritrovamenti. Esito: **63 elementi**, di cui
**5 smentiti** dai verificatori.

#### I quattro componenti — 1.651 righe

| Componente                       | Righe | Cos'era, e perché è morto                                                                                                                                                                                                             |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProductReviewStepComponent`     | 341   | il passo «Riepilogo» del wizard — sostituito dalle 4 schede il 19/07                                                                                                                                                                  |
| `ListFiltersComponent`           | 527   | il contenitore comune dei filtri — superato dalla decisione del **29/08**: «i filtri di un elenco stanno nelle sue COLONNE», e il pannello è passato al telaio                                                                        |
| `PaginationComponent`            | 447   | il paginatore condiviso — **migrazione completata**: nessun elenco impagina più                                                                                                                                                       |
| `DocumentLineMoneyCellComponent` | 336   | la cella d'importo di riga documento: ⛔ **non è stata superata, non è mai stata cablata**. Nata gemella di `document-line-unit-cell` e `document-line-code-cell`, che sono entrambe usate — `document-line-row` non l'ha mai montata |

⭐ **Tutti e quattro hanno un proprio `.spec.ts`**, ed è la ragione per cui sono sopravvissuti:
i test passano, la copertura li conta, e nessun controllo distingue «provato» da «usato».

#### Le funzioni — 59 fra `src/` e `api/`

Predicati di permesso, wrapper già marcati `@deprecated`, util di calcolo, tre endpoint API
mai chiamati dal client (`/customers/preview-code`, `/suppliers/preview-code`,
`/online-sales/by-order/:id`). Sono piccole — dalle 3 alle 50 righe.

⚠️ **Verificato un sospetto grave, e smentito**: i predicati di permesso morti
(`canViewSupplierOrders`, `canViewInventoryAllLocations`, `isTenantAdmin`…) potevano essere
**controlli dimenticati** invece che codice morto — cioè porte senza guardia. Non lo sono:
il permesso di **vista** è imposto dalla rotta (`tenantPermissionGuard` coi gruppi), quello
di **gestione** dal componente con un predicato diverso e vivo. La funzione c'è, il predicato
inutilizzato è un doppione.

#### ⛔ Cinque smentiti dai verificatori

Il più istruttivo è `DataTableRowActionsDirective`, dichiarata morta e invece **viva**: la usa
il motore tabella (`contentChild` + `ngTemplateOutlet`) e la sorveglia una guardia dentro
`npm run lint`. Anche `view-mode.model.ts` è stato smentito.

⚠️ **Un falso positivo di metodo, riportato dall'agente stesso**: cercare `<app-customer-form`
aggancia anche `<app-customer-form-fields`. Chi rifà questa analisi deve usare il confine
`<selettore([[:space:]/>]|$)`, o conta usi che non esistono.

### ⏸ Da decidere

- **Cosa togliere e in quanti passi.** I quattro componenti sono il caso netto; le funzioni
  sono molte e piccole.
- ⚠️ **Le guardie e le allowlist che puntano al codice morto vanno potate insieme**, o
  restano a validare il vuoto — lo segnala il censimento stesso.
- **Se serve una guardia nuova**: un controllo sui componenti mai istanziati impedirebbe al
  prossimo di restare 45 giorni. ⚠️ Va pesato: il progetto ha già oltre cinquanta guardie in
  `npm run lint`, e ognuna costa a ogni commit.

⚠️ **E questo documento ha una voce superata da correggere**: dice ancora «restano cinque
elenchi che impaginano ancora… `<app-pagination>` via». Non è più vero — è esattamente il
testo morto che `regole-qualita` vieta.

---

## 🔴 APERTO ORA — le cinque cose chieste il 01/09/2026

_Dettate dal proprietario dopo il rifacimento dell'anagrafica fornitore, in un messaggio
solo. Sono elencate nell'ordine in cui le ha dette; **i filtri restano per ultimi**, come
ha chiesto («poi passiamo ai filtri che abbiamo lasciato in sospeso»)._

| #   | Cosa                                                                                                                             | Stato                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A   | **Anagrafica CLIENTE come quella fornitore**                                                                                     | ✅ fatto (catalogo colonne compreso)               |
| B   | **Colonne del riepilogo fornitore** = i campi dell'anagrafica, principali attive di serie, **larghezza per tipo di dato**        | ✅ fatto                                           |
| C   | **Dettaglio fornitore**: togliere gli articoli collegati · vestirlo meglio · **decidere se le pagine di dettaglio si unificano** | ✅ fatto (l'unificazione: risposta col censimento) |
| D   | **I bottoni delle pagine fornitore sono più grandi degli altri**                                                                 | ✅ fatto                                           |
| E   | **I filtri**, ripresi da dove erano rimasti (modello Danea: selezione multipla, esclusione)                                      | ✅ fatto                                           |

### ✅ A — L'anagrafica cliente _(chiusa il 01/09/2026)_

Stesso lavoro del fornitore, e ora la **grammatica è scritta una volta sola**:
`styles/_anagrafica.scss`, mixin `anagrafica-fields($blocco)`, incluso dalle due schede.
Larghezze per contenuto, ordine di battitura, avvisi di digitazione, densità a **26px**
(`--control-h-entry`, sceso da 28 su richiesta del proprietario).

⭐ **Verificato in un browser vero** a 1440: 25 campi, scheda alta **945px**, nessuno
scorrimento orizzontale, giro del Tab nell'ordine di battitura (denominazione → fiscale →
indirizzo → contatti).

⭐ **E la spunta «Attivo» c'è**: `Customer.isActive` esisteva già nel database e nella
vista API, ma **nessuna maschera lo scriveva** — lo stesso buco del fornitore. Ora il DTO,
il servizio e il form lo portano fino in fondo.

⭐ **IBAN e cellulare** sono comparsi anche qui senza migration: stanno sul **soggetto**,
quindi sono lo stesso dato della scheda fornitore. Chi è cliente e fornitore ha un conto
solo, e si aggiorna da entrambe le schede.

⭐ **Costa poco adesso**: `domain/fiscal/` (P. IVA, codice fiscale, IBAN, CAP, provincia),
`app-form-section` e i token esistono già. E **IBAN e cellulare sono già nel database sul
soggetto**, quindi il cliente li eredita **senza migration**.

⭐ **E le COLONNE dell'elenco vanno rese comuni ai due** — indicato dal proprietario il
01/09/2026 spiegando perché Danea mette «Tipo» per primo: _«saranno colonne condivise che si
ripartiscono le schermate. Questa sarà condivisa con clienti»_.

Oggi `SUPPLIER_LIST_COLUMN_DEFS` sta in `features/suppliers/models/` ed è dei soli
fornitori, ma **i campi sono gli stessi perché è lo stesso soggetto**: codice, denominazione,
codici fiscali, indirizzo, contatti, note. Restano di ruolo solo sconto, pagamenti, IVA
predefinita, trasporto, IBAN/banca (fornitore) e SDI, listino, Shopify (cliente).

✅ **Estratto il 01/09/2026, quando i consumatori sono diventati due**:
`shared/table-columns/anagrafica-columns.ts` dichiara i segmenti del SOGGETTO — fiscali,
indirizzo, contatti, pagamento, IBAN, trasporto, sito, stato ruolo, ruolo gemello — e i due
elenchi li compongono con le proprie colonne di ruolo.

⛔ **Non un array unico con bandierine**: i due elenchi hanno colonne diverse (Ns. banca e
Porto di qua, Codice destinatario e Note commerciali di là), e un array solo avrebbe
richiesto interruttori per spegnerne metà.

⚠️ Nel catalogo fornitore «Anche cliente» è già in prima posizione, che è la posizione del
«Tipo» di Danea: quando i due elenchi condivideranno le definizioni, sarà il discriminante
che dice di quale dei due parla la riga.

⚠️ Il cliente ha in più il **codice SDI**, che il fornitore non ha: il controllo di forma
sta già scritto in `docs/06b` §B.4, con la contraddizione dichiarata sui 6 caratteri della
PA — va letta prima di implementarlo.

### B — Le colonne del riepilogo fornitore

> _«Adesso sappiamo quali colonne potrebbero essere selezionate nel riepilogo fornitore,
> sarebbero quelle dell'anagrafica. Di default facciamo partire le colonne principali
> attive e magari, se riusciamo, diamo una grandezza non obbligata ma di partenza consone
> al tipo di colonna.»_

Due cose distinte:

1. **Il catalogo**: le colonne attivabili diventano i campi dell'anagrafica (compresi i
   tre nuovi: IBAN, cellulare, Ns. banca). Le principali accese di serie.
2. ⭐ **La larghezza per TIPO di dato**, non obbligata ma di partenza: «cap e codice
   fornitore saranno molto ristrette, città leggermente più grande, denominazione ancora
   più larga, altre hanno campi obbligati e quindi conosciamo la larghezza».

⚠️ **Il motore ha già `widthOf`**, che deduce la larghezza dal tipo di colonna
(`regole-stile-ui` §6): il lavoro è dichiarare il tipo sulle colonne dell'anagrafica, non
inventare un secondo meccanismo.

### C — Il Dettaglio fornitore, e la domanda che vale per tutti

Tre pezzi, e il terzo è una **domanda di progetto**, non un compito:

- ⛔ **Togliere gli articoli collegati** dal Dettaglio fornitore.
- ⛔ **Vestire meglio la scheda.**
- ⏸ _«Il dubbio che mi viene è che la pagina dettagli può avere il componente condiviso
  con tutte le altre? Può essere unificata? Ottimizzata?»_

⚠️ **La domanda va risposta con un censimento, non a intuito**: esistono già
`_detail-page.scss` (mixin) e `app-detail-facts` (griglia etichetta/valore). Serve sapere
quante pagine di dettaglio ci sono, cosa hanno davvero in comune e cosa è proprio di
ognuna — e solo allora decidere se un componente condiviso è giustificato o se le
differenze sono troppe (la regola «quando NON estrarre» di `regole-architettura` vale
qui).

### D — I bottoni delle pagine fornitore

> _«I tasti di tutte le pagine che riguardano fornitore sono grandi rispetto agli altri.»_

⚠️ Da misurare a schermo prima di toccare: l'ipotesi è che le pagine fornitore **non
includano** la dichiarazione di densità che le altre hanno, non che abbiano una regola in
più. Le due cose si correggono in modo opposto.

### ✅ «Stato ruolo»: risolto lo stesso giorno — scelta la strada 1

Il proprietario ha scelto: _«a questo punto facciamo la 1. disattiviamo»_. La maschera
fornitore ha ora la spunta **«Attivo»**, accanto a «È anche cliente». Meccanismo verificato
sul database (tabella in `ANAGRAFICA-CANONICA-SPEC`), guida utente aggiornata con i due
interruttori.

✅ **Fatto anche sul CLIENTE** il 01/09/2026, con §A: la maschera ha la spunta «Attivo»
accanto a «È anche fornitore», e il percorso di scrittura (DTO → servizio → `Customer`)
esiste da oggi.

Qui sotto resta la diagnosi, perché spiega perché il difetto era invisibile.

### ⛔ Com'era: «Stato ruolo» non si impostava da nessuna parte _(01/09/2026)_

Domanda del proprietario: _«nel riepilogo del fornitore c'è uno "Stato ruolo" attivo, ma non
so cosa sia e dove si imposta»._ **Non si imposta: da qui, non si può.**

`Supplier.isActive` è lo stato del **ruolo** — disattivato significa «escluso dai nuovi
utilizzi, storico intatto». Cercato chi lo scrive, in tutta l'API:

```text
customers.service.ts:352   supplier.update({ isActive: false })   ← toglie la spunta «È anche fornitore»
                                                                     sulla scheda CLIENTE
suppliers.service.ts:671   isActive: original.isActive            ← la duplicazione copia il valore
```

⛔ **Non c'è nessun altro scrittore.** Dalla scheda fornitore, dalla sua maschera e dal suo
elenco non esiste un comando che lo cambi: un fornitore nasce attivo e resta attivo per
sempre, a meno che lo stesso soggetto sia **anche cliente** e qualcuno tolga la spunta «È
anche fornitore» **dalla scheda cliente**.

⚠️ **Quindi la colonna mostra uno stato che quella pagina non governa**, e nella pratica dice
sempre «Attivo». Le strade sono due, ed è una decisione:

|                           |                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Dargli un comando**     | una spunta «Attivo» nella maschera fornitore, come «È anche cliente» — così la colonna diventa utile |
| **Toglierla dall'elenco** | se il ruolo si disattiva solo di rimbalzo dal cliente, la colonna è rumore                           |

⚠️ **La stessa asimmetria vale al contrario sul cliente** (`customers.service.ts:298`): lì la
spunta c'è, ed è per questo che il difetto si vede solo da questa parte.

### ✅ E — I filtri _(chiusi il 01/09/2026)_

Adattati al modello Danea, e senza «cose complicate» com'era stato chiesto:

| Chiesto                | Dove sta                                                  |
| ---------------------- | --------------------------------------------------------- |
| **selezione multipla** | c'era già: `values` è un menu multiplo                    |
| **esclusione**         | ⭐ nuovo: verso «Includi / Escludi» nel pannello del menu |
| `(Tutto)`              | ⭐ nuovo: «Tutti», che svuota la selezione                |
| **AND fra colonne**    | c'era già, ed è l'unica combinazione (`14` §0.2)          |

⛔ **E strada facendo si è scoperto che i filtri a valori non si potevano usare
AFFATTO**: la tendina si apriva **invisibile**, ritagliata dall'`overflow: hidden` che
l'intestazione porta dal taglio a colonna del 30/08. Riquadro pieno, posizione giusta,
zero pixel dipinti — e la prova di resa che li guarda misurava proprio il riquadro.
Diagnosi e correzione in `14` §0.2.

**Le aree, in ordine di comparsa:** **righe documento e varianti (in corso)** · prima sincronizzazione Shopify · sedi · anagrafica
articolo · difetti aperti · Corrispettivo manuale · **tabulazione da tastiera** (punto 7,
il lavoro grosso aperto).

⚠️ **Il ramo cambia, e questa riga invecchia da sola**: al 20/08/2026 si lavora su
`feature/pagamenti-tesoriera`. Chi riprende verifichi con `git branch --show-current`
invece di fidarsi di quanto scritto qui.

---

# ⏸ VERIFICA VISIVA MANUALE PENDENTE — Passo 6 _(29/08/2026)_

> **Non blocca la chiusura funzionale del Passo 6**, che è CHIUSO: 6A backend e 6B UI.
> È un controllo successivo, non un difetto aperto.

Il selettore di stato commerciale (Ordine cliente e Ordine fornitore) e la visibilità
della colonna «Impegna magazzino» sono coperti da 18 prove di componente e 53 di
integrazione HTTP su PostgreSQL, ma **non sono mai stati guardati in un browser**.

⛔ **Perché non è stato fatto, e perché non va ritentato per altre strade.** Il
proprietario era da telefono. La via automatica si è fermata su due ostacoli misurati:
i progetti Playwright autenticati non esistono senza `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`,
e la via `mock-auth` riusa il server di sviluppo già in ascolto su `:4200` — compilato
con la configurazione vera invece che con `--configuration e2e`, quindi il login finto
non passa. Farla girare richiederebbe di fermare il server di sviluppo di chi sta
lavorando: **non si fa, e non si cercano configurazioni alternative.**

Quando si potrà, si guardano queste cose e basta:

```text
ORDINE CLIENTE
  nuovo                   Stato = Confermato · colonna «Impegna magazzino» visibile
  → Da confermare         la colonna sparisce subito · nessun effetto quantitativo
  salva e riapri          lo stato resta quello scelto (i tre)
  Concluso                mostrato, campo bloccato, altri campi modificabili,
                          «Impegna» nascosto

ORDINE FORNITORE
  nuovo                   Stato = Confermato
  selettore               Da confermare · Confermato · Annullato
  Concluso                mostrato e bloccato · nessuna colonna «Impegna» né «In arrivo»
  Ordine → Arrivo merce   flusso invariato: Ricevuto/residuo, collegamenti riga,
                          Arrivo merce snapshot autonomo
```

⭐ **Un punto della lista è già verificato**, e non serve rifarlo: l'endpoint
`POST /sales-orders/manual/:id/force-conclude` risponde **404** sull'API viva e non
compare fra le rotte mappate all'avvio.
---

# ⛔ LAVORO IN CORSO — righe documento, varianti, struttura _(23/08/2026)_

⚠️ **Questo blocco sta in cima perché è quello aperto adesso.** È scritto per essere
ripreso da zero: ogni voce dice se è **decisa**, se è **fatta**, e cosa la blocca.

Le decisioni argomentate stanno in **`docs/CONTRATTO-COMUNE-DOCUMENTI.md`** (§3.2 titolo
e variante, §4 richiamo articolo, §5.5 sconto, §5.7 listino, §6.2 spunte magazzino).
Qui c'è **cosa resta da fare**, non perché.

## ✅ RICERCA GIACENZA — rifatta il 02/09/2026

> **Fatta.** Cosa è cambiato, e cosa resta aperto, sotto la specifica dei requisiti.

⛔ **Il difetto era di una riga**: la schermata chiamava `findVariantByCode`, che risolve un
codice **esatto** e restituisce **una** variante (404 se ambiguo). Ecco perché «maglie» non
trovava niente — non mancavano i dati, era la domanda sbagliata.

⭐ **Quasi tutto esisteva già**, e non è stato scritto nulla di nuovo lato server:

| Pezzo                                                     | Cosa dà                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `searchVariantSummaries` (`/products/variants/summaries`) | cerca per testo → N risultati con **immagine, prezzi, giacenza, disponibilità**; una sola query Prisma, nessun N+1                       |
| `buildInventoryVariantSearchWhere`                        | il filtro copre **nome, SKU, barcode, codice articolo, SKU fornitore**, ed è multi-parola. `contains`, quindi «maglie» trova «magliette» |
| `VARIANT_SEARCH_DEBOUNCE_MS`                              | il debounce già condiviso con la ricerca articolo dei documenti                                                                          |

**Cosa è stato scritto:** il raggruppamento per articolo (`articolo-trovato.model`, 10 prove)
e la composizione della griglia taglia × sede (`ricerca-giacenza.model`).

### Le decisioni prese dal proprietario

| Domanda                              | Risposta                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| varianti o articoli fra i risultati? | **articoli**, poi le taglie toccando — tre modelli con quindici taglie sono tre righe, non quarantacinque |
| toccando un risultato?               | **la situazione per sede** — la domanda del commesso è «ce l'ho, e dove?»                                 |

### Come funziona adesso

```text
scrivi (dalla 3ª lettera, debounce, switchMap)
  → ARTICOLI: miniatura · nome · codice · n° taglie · disponibile · prezzo
      → tocco
          → griglia TAGLIA × SEDE, col totale
              → tocco su un numero: gli ordini che lo impegnano
```

⭐ **Chi scansiona salta un passaggio**: se il codice letto porta a un articolo solo, la sua
scheda si apre da sé. Vale solo per la scansione — digitando «mag» si possono avere per un
attimo pochi risultati, e aprirne uno porterebbe via dalla ricerca in corso.

### ⏸ Cosa resta aperto

#### ⛔ «Registra movimento» dalla Ricerca: **da gestire o rimuovere**

_Proprietario, 02/09/2026: «Registra movimento sulla taglia non ha senso, è una funzione che
va gestita o rimossa, da fare»._

⛔ **Tolto dalla schermata il 02/09/2026**, insieme al predicato di permesso che lo
governava: era rimasto attivo solo per lui, e un predicato che nessuno legge è debito.

**Perché sulla taglia non stava**: quindici taglie fanno quindici link nella stessa colonna,
e portano tutti a una maschera che **non sa in quale sede** — mentre la sede è esattamente
ciò che la griglia sta mostrando. Prima il link stava in testa alla scheda, e reggeva solo
perché la vecchia schermata mostrava **una variante sola**.

⚠️ **La domanda vera non è dove metterlo, è se ci vada.** Questa schermata è di
consultazione: si cerca per sapere «ce l'ho?». Un'azione che **modifica il magazzino**
dentro una vista di sola lettura è una decisione di prodotto, non una collocazione.

| Se si decide di gestirla       | Cosa servirebbe                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| dalla **cella** taglia × sede  | il contesto sarebbe completo (variante **e** sede), ma ogni cella avrebbe due gesti — il numero apre gli impegni, e il movimento cosa? |
| dalla **scheda** dell'articolo | serve prima scegliere taglia e sede: è una maschera, non un link                                                                       |
| **da nessuna parte**           | la Ricerca resta di sola consultazione, e il movimento si registra da Magazzino → Movimenti, dov'è già                                 |

⭐ **La terza è la più coerente con quello che la schermata è** — ma è una scelta, e va
fatta, non dedotta.

#### Il resto

- **Il tetto di 100 varianti per ricerca**, dichiarato a schermo con un avviso. Toglierlo
  richiede un aggregato di stock **per articolo** lato API, che oggi non esiste: `/products`
  non porta giacenze e `variants/summaries` pagina sulle varianti.
- **La catena di altezze**: l'esenzione in `stock-lookup.component.scss` resta finché non si
  guarda a schermo se la pagina debba stirarsi. Ora che i risultati sono un elenco, la
  risposta probabilmente cambia.
- **Nessuna vista registrata**: niente selettore Colonne né larghezze. Qui però non è una
  mancanza: l'elenco non è una tabella a colonne, è una lista di card per il pollice.

---

## 🔴 I REQUISITI, come sono stati dettati — 02/09/2026

_Dettati dal proprietario: «è nata senza un criterio e immagino la sua utilità per un
operatore che cerca un articolo tramite ean, sku o nome […] Un po' come i commessi di
Footlocker»._

> **È il palmare del commesso in negozio**: cerco, e vedo subito la situazione di ogni
> articolo che risponde — con l'immagine, la giacenza, la disponibilità e i prezzi.

### Cosa deve fare

|                  |                                                                                   |
| ---------------- | --------------------------------------------------------------------------------- |
| **Si cerca per** | EAN · SKU · **nome**                                                              |
| **Col nome**     | i risultati compaiono **man mano, dalla terza lettera** — non serve premere Invio |
| **Quanti**       | **tutti** quelli che corrispondono: «maglie» trova maglie, maglietta, magliette…  |
| **Per ognuno**   | immagine **piccola**, giacenza, disponibilità, prezzi, e i dati essenziali        |

⭐ **La ricerca per nome è a PREFISSO PARZIALE, non esatta**, ed è il punto: il commesso
non sa come è registrato l'articolo, sa come lo chiama il cliente. «maglie» deve trovare
tutta la famiglia.

⚠️ **Dalla TERZA lettera**, non dalla prima: con una o due lettere il risultato è mezzo
catalogo, e la richiesta parte a ogni tasto. È anche la soglia che rende utile il debounce
già prescritto per le liste grandi (`regole-gestionale`, «Performance»).

⚠️ **L'immagine è piccola e in elenco**, quindi valgono le regole già scritte per le
miniature di tabella (`regole-architettura`, «Immagini»): `width`/`height` sempre — o la
riga si assesta dopo il caricamento e la lista balla sotto il dito — più `loading="lazy"`
e `decoding="async"`.

### Cosa c'è oggi, e perché non basta

La schermata esiste (`features/inventory/stock-lookup`) e cerca **un articolo alla volta**,
mostrandone la scheda con una tabella di giacenze per location. ⛔ Non è un elenco di
risultati: è il dettaglio di una cosa sola, quindi la domanda «quali maglie ho?» non ha
risposta.

⚠️ **Ha anche il lettore ottico** (`app-barcode-scanner`), che va conservato: è la strada
veloce quando il capo ce l'hai in mano.

### Due cose tecniche già misurate, da tenere presenti quando si farà

⏸ **La catena di altezze è esentata, non risolta.** `stock-lookup` è l'unica pagina che
monta `app-list-page` senza passare l'altezza al telaio: oggi ha un'esenzione dichiarata
nel proprio foglio, perché nella sua zona dati c'è la scheda di un risultato e non un
elenco. **Con l'elenco di risultati la domanda cambia** e l'esenzione va tolta — la
guardia è `npm run check:catena-altezze`.

⏸ **Nessuna vista registrata**: niente selettore Colonne, niente larghezze che si
conservano. Diventando un elenco vero, entra nel giro come gli altri (`14` §22.3).

---

## ⏸ IL RISCONTRO DELLA SCANSIONE non c'è dove si inseriscono articoli in continuo — 02/09/2026

_Trovato dal proprietario provando l'**Arrivo merce**, che ha una cella per l'EAN: «non ha
già lo stesso comportamento? mi sa di no, ho verificato e non lo fa». Verificato: è così._

> **Dove si inseriscono articoli uno dopo l'altro — con la pistola o battendo l'EAN — la
> riga toccata deve dirlo: si accende per un momento, e la pagina ci scorre sopra se non
> è già in vista.**

⛔ **Oggi lo fa solo il dettaglio inventario.** Al banco, dopo una scansione
(`afterAcquire` in `store-sale-document-form`), succede questo:

```text
campo svuotato · beep (solo su mobile) · fuoco che torna alla ricerca
```

⚠️ **E il caso che lo giustifica è l'EAN RIPETUTO.** Il banco ha la regola «stesso EAN due
volte → la riga esistente cresce» (`11` A14, `stepQuantity`): se quella riga è fuori vista
perché il documento ne ha venti, **non si vede cambiare niente**. Il commento nel codice
dice «su desktop la riga che compare è già la conferma» — vero per una riga **nuova** e
**visibile**, falso per un incremento lontano. Su desktop il beep non suona nemmeno.

### Il parere dato al proprietario, che ha chiesto se vale ovunque

| Caso                                                         | Serve                                  |
| ------------------------------------------------------------ | -------------------------------------- |
| EAN ripetuto che **incrementa una riga lontana**             | ⭐ **sì, è il caso che lo giustifica** |
| riga nuova inserita **non in fondo** (banco, Ordine cliente) | ✅ sì                                  |
| riga nuova già visibile in un documento corto                | ➖ indifferente: il lampo non disturba |

⭐ **I due pezzi NON si adottano allo stesso modo.** L'**evidenziazione** vale ovunque: non
sposta niente e risponde all'unica domanda che ci si fa — _ha letto la riga giusta?_ Lo
**scorrimento** solo con `block: 'nearest'`, che **non fa nulla se la riga è già in vista**.

⛔ **Mai `block: 'start'`** — la forma usata altrove nell'app per Allegati e banner d'errore:
quella salta **sempre**, e in una maschera documento vuol dire che chi sta compilando la riga
3 si ritrova alla 18 e perde il posto. Nell'inventario il rischio non c'è perché si conta e
basta; in un documento sì.

### ⚠️ Le due famiglie sono separate, e l'aggancio è di una sola

|                                                              |                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| **motore tabella** (`data-table`)                            | ✅ ha `highlightedRowId` e `[data-row-id]` dal 02/09/2026 |
| **griglia di riga documento** (`document-line-head` + righe) | ⛔ non usa il motore: serve il gemello                    |

⭐ **Al secondo consumatore l'estrazione diventa obbligatoria** (`regole-architettura`,
regola «1 + 1»): la sequenza — trova l'articolo, accendi, scorri se serve, spegni dopo 2,5s
— oggi vive solo in `inventory-count-detail`. Quando si fa il gemello, quella va estratta
invece di copiata.

### Dove si applica — misurato il 02/09/2026 su 42 schermate

Censimento di tutte le schermate con tabella, ogni area verificata da un secondo agente
incaricato di smentire il primo. **Sette schermate inseriscono o cercano articoli in
continuo; sei non hanno il riscontro:**

| Schermata                  | Riscontro                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Dettaglio inventario       | ✅ ce l'ha (è quella da cui è nato)                                                       |
| **Arrivo merce**           | ⛔ — la cella EAN da cui è partita la segnalazione                                        |
| **Vendita al banco**       | ⛔ — ed è il caso peggiore: l'EAN ripetuto incrementa una riga che può essere fuori vista |
| **Ordine cliente**         | ⛔                                                                                        |
| **Movimento di magazzino** | ⛔                                                                                        |
| **Ricerca giacenza**       | ⛔ — ma va rifatta comunque (sezione sopra)                                               |
| **Giacenze**               | ⛔ — da verificare se lì lo scanner filtra invece di inserire                             |

⚠️ **Prodotti ha lo scanner ma NON è questo caso**, e l'ha corretto il verificatore: la
scansione trova l'articolo e **naviga alla sua scheda** — si esce dall'elenco, non si
aggiunge una riga. Nessun riscontro da dare.

⭐ **Le due famiglie restano separate**: il motore tabella ha già l'aggancio, la griglia
di riga documento no — e cinque delle sei schermate qui sopra sono maschere documento.

---

## ⛔ PRODOTTI: cinque colonne dichiarate ordinabili, e l'ordinamento non arriva — 01/09/2026

_Trovato dalla revisione del 01/09/2026, e **non è lavoro di quella giornata**: è
preesistente. Riportato invece di correggerlo di passaggio, perché la correzione tocca
l'API e va decisa._

> **L'operatore preme «Brand», la freccia si accende, l'URL diventa `?sort=brand&order=asc`
> — e le righe non si muovono.**

La catena è interrotta in **tre punti**, e ognuno da solo basta:

| Dove                                                          | Cosa manca                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `product-table.component.ts:44`                               | `PRODUCT_SORTABLE_COLUMNS` marca ordinabili name, brand, category, season, status                                        |
| `domain/products/services/product.service.ts` (`getProducts`) | costruisce gli `HttpParams` con page, pageSize, all, search, status, category, brand, season — **mai `sort` né `order`** |
| `api/src/products/dto/list-products.query.dto.ts`             | non ha nessun campo `sort` o `order`: anche mandandoli, verrebbero scartati                                              |

⚠️ **Il commento del componente dichiara la strada scelta** — «L'ordinamento è del SERVER:
`sortChange` risale fino alla query» — quindi non è un ripiego dimenticato: è una strada
imboccata e non finita.

⛔ **QUI C'ERA SCRITTO «non si rimedia ordinando in memoria», e la premessa era FALSA** —
corretto il 01/09/2026, un'ora dopo averlo scritto. La motivazione addotta era che l'elenco
Prodotti carica una pagina per volta, quindi ordinare in memoria avrebbe ordinato la sola
pagina a schermo.

⭐ **L'elenco Prodotti carica TUTTE le righe del filtro**, e lo dichiara:
`getProducts(query, { tutto: true })` in `product-list.component.ts:252`, col commento
«l'elenco mostra tutte le righe del filtro, non una pagina» — è la decisione «nessun tetto
di righe». Esattamente come Clienti e Fornitori, che infatti ordinano in memoria.

⭐ **Quindi la via breve è quella giusta, e non è un ripiego**: `ordinaPerColonne`, la
stessa funzione dei cinque elenchi che già la usano. Nel componente sono una decina di
righe, sul modello di `customer-table.component.ts:86`:

```ts
private readonly ordinate = computed(() =>
  ordinaPerColonne(this.righe(), this.sortState(), {
    cellText: (riga, columnId) => this.cellText(riga, columnId),
  }),
);
```

⚠️ **Resta da decidere UNA cosa**, ed è di prodotto, non tecnica: l'ordinamento scelto oggi
finisce nell'**URL** (`?sort=brand&order=asc`, scritto da `onSortChange` a riga 380), che è
un pregio — il link si condivide e si ricarica ordinato. Ordinando in memoria quel pezzo si
può tenere: l'URL resta la memoria della scelta, e ad applicarla è il client. Va confermato
che si vuole tenerlo.

⛔ **E il commento del componente va corretto insieme al codice.** Dice «L'ordinamento è del
SERVER: `sortChange` risale fino alla query»: è il residuo della strada imboccata e non
finita, e chi lo legge dopo la correzione cercherebbe un percorso che non esiste più.

⚠️ **La strada del server resta possibile** — `sort`/`order` nel DTO, whitelist, `orderBy`
in Prisma, come `parseDocumentListSort` e `parseSupplierOrderSort` — ma oggi non serve a
niente: il server manda comunque tutte le righe, quindi ordinarle là costa un giro di rete
in più per lo stesso risultato. Tornerà utile il giorno in cui i Prodotti reintroducessero
la paginazione.

## ⏸ Corrispettivi: 14 blocchi di CSS orfano dopo il telaio — 29/08/2026

Testata, riga filtri, pulsante «Filtri» mobile e i campi del vecchio pannello sono del
telaio: le loro regole in `corrispettivi-report.component.scss` non agganciano più niente.

`corrispettivi__header · __heading · __title-row · __title · __count · __subtitle ·
__header-actions · __filters · __filters-main · __filter--active · __mobile-filters ·
__columns-picker · __field · __label`

⚠️ **Sono inerti** — non possono sporcare la resa — ma vanno tolte. Un tentativo con uno
script il 29/08 ha mangiato le chiusure dei commenti e sbilanciato le graffe: **annullato**.
Va fatto a mano, blocco per blocco, con la build a ogni passo.

## ✅ Il riepilogo Corrispettivi — chiuso il 30/08/2026

⛔ **Qui c'era «ha DUE fasce, la regola ne vuole UNA»**, aperta il 29/08. La voce è
superata: il 30/08 la forma è cambiata di nuovo, e la domanda «una o due fasce» non è più
quella giusta.

**Come sta adesso**, e la regola lo dichiara in «Riepilogo di fondo pagina»: voci
**impilate** (etichetta sopra, valore sotto) a **ogni** larghezza, in una griglia
`auto-fit` che decide da sé quante colonne stanno — due a 320px, tre a 390, quattro da
430, tutte su una riga da `lg` in su.

⭐ **La forma impilata ha chiuso anche la «DECISIONE APERTA» sulla soglia**: serviva
sapere a quale larghezza la fascia a riga unica dovesse cedere. Impilata ci sta sempre —
615px invece di 918 — quindi non c'è più una soglia da decidere.

## ⛔ Corrispettivi: manca l'imponibile diviso per ALIQUOTA — 01/09/2026

_Proprietario: «manca la divisione dell'imponibile in base alle aliquote, almeno nelle
stampe ed esportazione per dare i dati al commercialista»._

⭐ **Il perimetro è dichiarato: stampa ed export.** A schermo può restare com'è — questa
voce non chiede una colonna nuova nel Registro né una fascia nel riepilogo.

### Cosa c'è già, e non va rifatto

|                            |                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| la **struttura per riga**  | `CorrispettivoVatBreakdownRow` — `ratePercent · netMinor · vatMinor`, già nel modello dell'API |
| la **colonna nell'export** | «Dettaglio IVA», ultima colonna di `corrispettivi-export.service`                              |
| chi la **riempie**         | **solo il Corrispettivo manuale**, l'unica sorgente che conserva le proprie righe per aliquota |

### ⛔ Cosa manca, e perché è stato lasciato così

Le altre tre sorgenti — ordini, vendite al banco, resi — lasciano quella colonna **vuota**,
e il commento dell'export dice perché:

> _«il dato esiste nel database ma il Registro non lo legge, e riempirla per corrispondenza
> inversa direbbe una cosa non verificata su un file che va fuori dall'azienda»_

⚠️ **La cautela era giusta e va rispettata**: il lavoro non è «riempire la colonna», è
**leggere le righe IVA delle altre tre sorgenti** e portarle fino all'export. Ricavare
l'aliquota per differenza (imposta ÷ imponibile) è la scorciatoia da non prendere: su un
documento a due aliquote dà un numero che non esiste.

### ⏸ Le due domande da chiudere prima di scrivere

1. **Per riga o per periodo?** Il commercialista di solito vuole il **riepilogo per
   aliquota del periodo** — «imponibile 22%, imposta 22%, imponibile 10%…» — che è una cosa
   diversa dal dettaglio riga per riga che l'export ha oggi. Probabilmente servono
   entrambi, e vanno decisi separatamente.
2. **Nel riepilogo del Registro no, ma nella stampa dove?** In coda al documento come
   sezione di riconciliazione, o come foglio a parte dell'export.

⚠️ **Vale la regola del riepilogo**: gli importi per aliquota si ottengono **sommando gli
importi IVA finali delle righe** di quel codice — mai `imponibile × aliquota`, che è lo
stesso errore di arrotondamento un piano più in alto (`regole-gestionale`, «L'IVA per
aliquota segue la stessa regola»).

---

# ⛔ DA FARE OGGI — deciso dal proprietario il 30/08/2026

_«Segnati queste cose da fare e oggi vanno fatte, non perderle.»_

## 1. ⛔ La nuova VENDITA AL BANCO non si salva — ANCORA APERTA

> **Il proprietario apre da `localhost`, e il 01/09/2026 ha confermato: «ancora
> non funziona».**

⛔ **Quindi la causa trovata quel giorno NON è la sua**, ed è scritto qui perché
è l'errore da non ripetere: un difetto reale, misurato e sullo stesso percorso
**non è per questo il difetto segnalato**. Da `localhost` il contesto è sicuro e
`crypto.randomUUID` c'è.

⭐ **Quel che si è imparato resta e vale**, ed è elencato sotto: il server è a
posto (prove di integrazione), e una seconda causa possibile è stata chiusa.

### ⭐ La domanda del proprietario, che è la pista buona

> _«Dovrebbe essere un documento come tutti gli altri e con componenti condivisi.
> Cambia solo la contabilità.»_

⚠️ **E oggi non lo è**: la Vendita al banco ha un endpoint proprio
(`POST /store-sales`), un servizio proprio e una maschera propria — è la
**quarta strada** che persiste un `Document` senza passare da
`confirmDocumentTx`, e lo dice già un commento nel suo DTO. Ogni difetto
trovato lì è un difetto che le altre maschere non hanno perché non passano di
lì.

**Da fare quando si riprende**, in quest'ordine:

1. riprodurre il rifiuto **con l'utente vero** (non l'auth mock, che l'API non
   accetta) e leggere stato e corpo della risposta;
2. solo allora decidere se si corregge il caso o si **rientra nel percorso
   comune**, che è la domanda che il proprietario ha posto.

### ✅ Quel che è già stato chiuso il 01/09/2026

**Il server è a posto, e non è una deduzione**: tre prove di integrazione HTTP su
PostgreSQL vero (`vendita-al-banco.integration-spec.ts`) creano una vendita con
riga, una senza righe e verificano l'idempotenza dell'intento. Verdi al primo
colpo, col payload esatto della maschera.

**Una seconda causa, reale ma non la sua:** `crypto.randomUUID()` non esiste
fuori dal contesto sicuro.

Misurato in Chrome, sulla build di questa applicazione:

```text
http://127.0.0.1:4212      isSecureContext true    crypto.randomUUID  function
http://192.168.1.50:4212   isSecureContext FALSE   crypto.randomUUID  undefined
                                                    crypto.getRandomValues  function
```

⛔ **Non restituisce un valore sbagliato: LANCIA.** E lancia nel punto peggiore —
dentro `save()`, mentre genera l'intento di creazione, prima che parta la
richiesta: nessun `error:` la raccoglie, nessun avviso compare. A chi preme
sembra soltanto che **non succeda niente**, che è la segnalazione parola per
parola.

⚠️ **La correzione del 30/08 — portare in vista l'avviso d'errore — non poteva
funzionare**: non c'era nessun errore da mostrare, perché la richiesta non
nasceva.

⭐ **Il server era ed è a posto**, e non è una deduzione: quattro prove di
integrazione su PostgreSQL vero (`vendita-al-banco.integration-spec.ts`) creano
una vendita con riga, una senza righe e verificano l'idempotenza dell'intento.
Tutte verdi al primo colpo. La causa non era mai stata lì.

⚠️ **Nessun test poteva prenderlo**, e vale la pena saperlo: jsdom e Chrome
headless su `localhost` sono **entrambi contesti sicuri**. Il difetto esiste solo
dove l'applicazione si usa davvero — il telefono in magazzino — e lì non gira
nessuna suite.

**Corretto** con `nuovoId()` (`@core/utils/uuid.util`), che ripiega su
`getRandomValues` — che invece c'è, misurato. La guardia è
`npm run check:contesto-sicuro`.

⚠️ **Restava un secondo consumatore, e più largo**: `toast.service` usava la
stessa API. Da un'origine di rete **ogni notifica** lanciava — cioè l'errore che
nasconde l'errore.

⚠️ **Confermato il 01/09/2026: apre da `localhost`**, quindi questo non era il
suo caso. Resta corretto perché chiunque apra il gestionale dal telefono in
magazzino lo incontrerebbe — e perché rompeva **ogni toast** su quell'origine.

## 2. ⛔ ELIMINA e DUPLICA — la semantica è quella dell'U.M. e del Codice IVA

⭐ **Decisione del proprietario, 30/08/2026**, e chiude la domanda che era rimasta
aperta:

> _«Quello che deve succedere con Elimina è come funziona con l'IVA e con l'U.M.:
> quando cancello un'u.m., il dato nei documenti diventa testo e non sparisce.
> Tutto quello che è salvato nel gestionale resta, quindi i dati dai movimenti e
> documenti non spariscono, sparisce solo la scheda cliente.»_

**Il criterio:** ciò che è **fotografato** dentro un documento o un movimento è
del documento, non dell'anagrafica. Eliminare l'anagrafica toglie la scheda; gli
snapshot restano leggibili come testo.

⚠️ **Non è un soft-delete travestito**: la riga anagrafica sparisce davvero. È il
documento che non aveva bisogno di lei, perché aveva già copiato quello che gli
serviva.

⛔ **Da verificare PRIMA di scrivere l'endpoint**: quali snapshot esistono già
sulle righe (nome, codice, partita IVA), e quali riferimenti sono invece **chiavi
esterne** che il database rifiuterebbe di lasciare orfane. Dove manca lo snapshot,
va aggiunto prima — o l'eliminazione romperebbe una lettura.

Entità coinvolte: **Clienti**, **Fornitori** (nessun `DELETE` nell'API oggi).

## 3. ⛔ Le PILL colorate spariscono dai riepiloghi

_«Le card colorate intorno ai testi vanno levate nei riepiloghi, resta solo il
testo colorato, come abbiamo già fatto altrove.»_

Fatto su prodotti, clienti, giacenze e situazione. **Restano** i movimenti (colonna
Tipo), i documenti, gli ordini, le vendite online, l'inventario.

## 4. ⛔ INVENTARIO — l'elenco sessioni non è nel motore

`/app/inventory/counts`: tabella propria, niente riga totali, niente selezione,
pill piene. Va nel motore come gli altri undici.

## 5. ⛔ VENDITA MANUALE — riepilogo e maschera

Sia l'**elenco** (contenitore comune e colonne) sia la **maschera di nuova vendita
manuale**.

⚠️ **Attenzione al pannello di controllo**: la Vendita manuale si disattiva da
Impostazioni (`TenantFeatureSettings.manualUnloadEnabled`), nasce **spenta**, e il
rifiuto è sull'**API** — non solo nella UI. Toccare quella maschera senza tenerne
conto significa riaprire un interruttore di sicurezza.

## 6. ⛔ I riepiloghi dei DOCUMENTI come quelli dei Corrispettivi

_«I riepiloghi, almeno quelli dei documenti, possiamo sistemarli e unificarli come
quelli dei corrispettivi.»_ — e verificare che **contenitore e colonne** siano
davvero quelli comuni, non solo simili.

---

# ✅ IL MOTORE TABELLA È COMPLETO — 30/08/2026

**Undici elenchi su undici** usano lo stesso motore. Nessuno impagina più.

|                  |                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **entrati oggi** | Prodotti · Clienti · Giacenze · Situazione magazzino                                                                                                                                                                                                                                                         |
| **c'erano già**  | Documenti · Ordini cliente · Ordini fornitore · Vendite online · Movimenti · Corrispettivi                                                                                                                                                                                                                   |
| **entrati dopo** | **Fornitori** e **Inventario** — ⛔ qui c'era «fuori dal motore, ha ancora una tabella propria»: **falso**, verificato il 02/09/2026 in `supplier-table.component.html` e `inventory-count-table.component.html`, che montano entrambi `<app-data-table>`. Chi leggeva credeva di avere un elenco da migrare |     |

## Che cosa ha preso ognuno

- **taglio a colonna**: il testo sta su una riga e viene tagliato dalla colonna
  successiva, col divisore verticale che segna dove. Il testo intero resta nel
  `title` di ogni cella;
- **altezza di riga dichiarata** (`--table-row-h`), che prima era un token che
  nessun elenco leggeva;
- **maniglia di larghezza visibile** — era un bersaglio trasparente da 4px;
- **riga totali**: «N voci» più le somme delle colonne visibili, che seguono la
  selezione. Sui documenti col **verso economico** — fattura 100 + nota di credito
  30 = 70;
- **titolo della card** dichiarato dalla colonna (`cardTitle: true`), che prima lo
  dava un mixin CSS legato a una classe e si era perso migrando;
- **pill piatte**: testo colorato invece di pastiglie, che è anche ciò che
  assottiglia la riga.

## ⏸ Quel che resta, e serve una decisione

⛔ **«Duplica ed Elimina dappertutto» non si può completare.** L'eliminazione c'è
sui prodotti e sui documenti, dove l'API la espone. Altrove **non esiste
l'endpoint**:

| entità                          | `DELETE`      | duplicazione  |
| ------------------------------- | ------------- | ------------- |
| Clienti · Fornitori · Movimenti | ⛔ non esiste | ⛔ non esiste |

⚠️ **E prima dell'endpoint c'è una decisione di dominio, non tecnica**: si può
eliminare un cliente che ha **fatture emesse**? Il documento conserva i suoi dati
fotografati e non si romperebbe, ma sparirebbe l'anagrafica da cui è nato. Le
strade sono tre — eliminazione vera, disattivazione (come `linkedSupplierActive`,
che già esiste), blocco se ha movimenti — e sono tre lavori diversi.

⏸ **I filtri dei Prodotti** sono ancora in una toolbar dedicata
(`app-product-toolbar`), mentre `regole-stile-ui` dal 29/08 dice che «i filtri di
un elenco sono le sue colonne». È l'ultimo elenco con la forma vecchia.

⏸ **Le larghezze di colonna** vanno tarate pagina per pagina — decisione del
proprietario, 30/08: «le gestiremo pagina per pagina successivamente».

⚠️ **Nulla di tutto questo è stato verificato a schermo**: la build di prova non
ha dati, e le misure sono state fatte leggendo il codice e i test.

---

# ⛔ APERTO ADESSO — deciso il 30/08/2026, da eseguire

Tre lavori chiesti dal proprietario nella stessa sessione, in ordine di come li
ha posti. ⚠️ Nessuno è cominciato: qui c'è quanto basta a riprenderli senza
ricostruire il ragionamento.

## 1. ⏸ Il SELETTORE DI VISTA — base fatta, manca l'ultimo pezzo _(30/08/2026)_

### ✅ Quello che c'è già, e non va rifatto

```text
view-mode.model.ts        auto · compact · wide, con etichette e spiegazioni
ViewportService           la scelta, la persistenza per DISPOSITIVO, e compact()
                          che la rispetta — i 17 consumatori non sanno che esiste
attributo data-vista      scritto sulla radice solo quando la vista è imposta
mixin vista-compatta      il ramo CSS, +4 kB (+0,09%)
```

⭐ **È inerte e non fa danno**: senza il selettore nessuno può impostare nulla,
quindi `data-vista` non viene mai scritto e nessuna regola cambia peso.

### ⛔ E QUELLO CHE MANCA, con la misura che l'ha smascherato

Il selettore in Impostazioni → Aspetto era stato scritto, provato **a schermo** e
poi **ritirato**, perché la funzione non funzionava:

```text
1400px, «Sempre compatta»    card visibili 6 · intestazioni visibili 9
```

⛔ **Le due viste insieme** — il difetto che `regole-stile-ui` §9 chiama «la
stessa riga non esiste due volte». A nascondere l'intestazione è
`data-table-mobile-cards`, che è **incluso da 19 componenti**: convertirlo
moltiplica la duplicazione per diciannove.

```text
solo il motore tabella (3 blocchi)    +4 kB     ⛔ card e intestazioni insieme
+ il mixin delle card (19 volte)      +100 kB   ✅ funziona   (+2,2% su 4,48 MB)
```

⚠️ **La prima misura era giusta e la conclusione sbagliata**: avevo misurato il
costo senza verificare che il risultato funzionasse. L'ho scoperto solo provandolo
nel browser — build e test erano verdi in entrambi i casi.

### ⭐ COME RIPRENDERLO, in un colpo solo

Deciso dal proprietario il 30/08/2026: «adesso nessuno utilizza il gestionale,
possiamo lasciare così, completare altro lavoro e poi riprendere questo,
eviteremmo di fare il doppio».

1. **Rifattorizzare `data-table-mobile-cards`** perché la regola che nasconde
   l'intestazione stia in un punto solo invece che dentro il mixin incluso 19
   volte. È il lavoro che fa tornare indietro i 100 kB.
2. **Poi** convertire quel punto a `vista-compatta`.
3. **Infine** il selettore in Impostazioni, accanto al tema — che è la sua casa:
   sono le due scelte su come si vede l'app su QUESTO schermo.

⛔ **In quest'ordine, e non al contrario.** Aggiungere prima il selettore
consegnerebbe una funzione rotta; rifattorizzare prima di avere la funzione che
gira significa lavorare al buio — ed è da lì che è nato il difetto sopra.

### Le decisioni già prese, che restano

|                                                                           |                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **«Compatta» ed «estesa»**, non «mobile» e «desktop»                      | nominano ciò che si vede, non il dispositivo che si suppone. Chi sceglie «compatta» su un monitor da 27 pollici vuole le card, non sta dicendo di essere su un telefono         |
| **La scelta vive nel DISPOSITIVO**                                        | non sul profilo: chi impone la compatta sul monitor del banco non la vuole sul portatile                                                                                        |
| **Il default è `auto`**                                                   | la soglia sbaglia solo sui casi limite: partire da una vista imposta li renderebbe la regola                                                                                    |
| ⛔ **Sostituisce la doppia soglia per PUNTATORE** di `regole-stile-ui` §9 | decisa l'11/08, mai eseguita, superata il 30/08. La ragione stava già in quella regola: «nessuna linea fissa chiude la questione» — e vale identica per le soglie del puntatore |

⚠️ **Copre la vista, non ogni dettaglio.** Metà del progetto è mobile-first — 105
`media-up` contro 95 `media-down` — e quei blocchi continuano a valere sullo
schermo largo: la tabella diventa card, ma qualche spaziatura resta quella da
scrivania. Sopprimere anche i `media-up` chiede di avvolgerli, e **quello sì**
cambia la specificità di ogni regola responsive — con tre difetti di specificità
già incontrati in una sola giornata, è un lavoro a sé.

## 2. ⛔ «Nuovo arrivo merce» non ha senso nel Registro documenti

> _«Nuovo arrivo merci nei documenti generali non ha senso che esista quel
> pulsante. Al massimo resta quello affianco "Altro documento" e viene
> rinominato in "Crea documento" e fa selezionare il documento che vogliamo.»_

Il Registro documenti è l'elenco di TUTTI i tipi: offrire come azione primaria la
creazione di UNO — l'arrivo merce — è una scorciatoia che privilegia un tipo
senza una ragione visibile.

**Da fare:** togliere il pulsante primario, e rinominare il menu accanto da
«Altro documento» a **«Crea documento»**. ⚠️ Il menu ha già i test
(`document-list.component.spec.ts`) che verificano che offra solo i tipi
gestibili dai permessi: quelli vanno aggiornati, non rifatti.

⚠️ **Riguarda il solo Registro generale.** Gli elenchi filtrati per famiglia —
Arrivi merce, Vendite al banco — hanno un'azione primaria legittima, perché lì
il tipo è uno solo e non c'è niente da scegliere.

## 3. ⛔ Gli INDIRIZZI mescolano due lingue, e tre sono nomi di database

Misurato il 30/08/2026 sull'intera mappa delle rotte.

```text
primo livello   corrispettivi · vendita-al-banco · cambia-password        ← italiano
                dashboard · products · inventory · orders · suppliers
                documents · sales · online · customers · reports
                guide · settings · admin                                  ← inglese

dentro Documenti  arrivi-merce · registro · proforma
                  registrazioni-fatture-fornitori                         ← italiano
                  sales-ddt · manual-unload · quote · fattura             ← inglese, e «fattura» in mezzo
```

✅ **Due fatti il 30/08/2026**: `manual-unload` → `vendita-manuale` e
`sales-ddt` → `ddt-vendita`, in codice, test, briciole, guida admin e documenti.

## ⛔ E il terzo — `quote` — NON si rinomina come gli altri

Provato, e **ha rotto la build in cinque punti**. La causa è una distinzione che
non si vede finché non la si urta:

```text
SalesDdt      'sales_ddt'      ≠  rotta 'sales-ddt'       → rinominabile
ManualUnload  'manual_unload'  ≠  rotta 'manual-unload'   → rinominabile
Quote         'quote'          =  rotta 'quote'           ⛔ LA STESSA STRINGA
```

⭐ **Il trattino contro l'underscore** teneva separati il tipo documento e il
segmento di rotta nei primi due. Su `quote` la stessa stringa fa **due mestieri**:
è il valore che va e viene dal database _e_ l'indirizzo. Rinominarla ha cambiato
un membro dell'unione `DocumentType`, cioè un valore che l'API si aspetta.

⛔ **E il danno non era solo di compilazione.** Sono state trovate a mano due cose
che nessun errore avrebbe segnalato:

- `describe('quote')` in un test sulle **quote percentuali** delle colonne,
  rinominato in `describe('preventivo')` — la parola italiana «quote» non c'entra
  niente con i preventivi;
- la mappa delle **briciole** aveva la chiave `quote:` non quotata, quindi la
  sostituzione non la toccava: la rotta sarebbe diventata `preventivo` e la
  briciola avrebbe mostrato il segmento grezzo. Il commento sopra quella mappa lo
  dice da sempre — «senza questa voce il segmento usciva grezzo».

⏸ **Come si farà**: non rinominando il tipo, ma **disaccoppiando** la rotta dal
tipo. `SALES_FORM_ROUTE_SEGMENT` fa già esattamente questo per altri quattro —
`Invoice → 'fattura'`, `CreditNote → 'nota-di-credito'` — e `quote` va aggiunto
lì invece che sostituito ovunque.

### ⭐ La rinomina COMPLETA all'italiano: si fa

⚠️ **I due vincoli che la frenavano non esistono più**, ed entrambi li ha tolti
il proprietario il 30/08/2026:

- **niente clienti, niente dominio** — «il gestionale è in realizzazione e nessun
  cliente lo tiene»: nessun segnalibro da rompere, nessun redirect di
  compatibilità da mantenere;
- **il ramo del collega** «andrà cancellato o adattato, noi procediamo»: cade
  l'argomento dei conflitti fantasma su oltre 200 file.

## ⛔ IL METODO, e non è una formalità

> _«Bisogna farlo facendo attenzione a cosa è davvero ogni rotta e non combinare
> guai, e vedere bene dove si trova.»_ — il proprietario

### 1. Quattro segmenti sono SOTTOSTRINGA di un altro

Una sostituzione cieca ne corrompe un secondo, e il danno **non si vede**: la
rotta continua a esistere, punta altrove.

```text
«sales»   dentro «sales-ddt»
«edit»    dentro «nota-di-cr-EDIT-o»      ← la peggiore
«print»   dentro «print-label»
«fattura» dentro «fattura-accompagnatoria»
```

### 2. Due parole esistono già NELLE DUE LINGUE

`new` e `nuovo`, `edit` e `modifica`: la stessa azione con due nomi, che è
peggio di una scelta coerente in una lingua sola.

### 3. ⛔ `clients` e `customers` sono DUE COSE DIVERSE

```text
/app/admin/clients   i TENANT della piattaforma   (titolo: «Clienti»)
/app/customers       i clienti dell'AZIENDA
```

Tradurli entrambi in `clienti` farebbe collidere due concetti che il gestionale
tiene separati. Serve una parola diversa per il primo — `aziende`, `tenant` — e
la scelta è di prodotto, non tecnica.

### 4. I segmenti non sono tutti letterali

`SALES_FORM_ROUTE_SEGMENT` e `STORE_SALE_ROUTE_SEGMENT` costruiscono rotte da
costanti: chi cerca solo `path: '...'` non li trova.

### 5. Dove guardare, oltre ai file di rotta

`routerLink`, `router.navigate`, i `redirectTo`, le utility di navigazione
(`document-routing.util`, `store-sale-routing.util`), gli e2e. ⭐ La guardia
`check:router-links` esiste già e conta 21 destinazioni statiche più 10 in
binding: va rieseguita a ogni passo, non solo alla fine.

⭐ **Si procede un segmento alla volta**, con build e test dopo ciascuno. Una
rinomina di rotte che sbaglia non fallisce a compilazione: manda l'operatore su
una pagina diversa.

## 3-ter. ⛔ L'AUDIT: 41 RISCHI, TUTTI SILENZIOSI _(30/08/2026)_

Il proprietario ha chiesto: «sei certo che la rinomina delle rotte non crei
danni?». **No.** Novantasei agenti su sette lenti, ognuno obbligato a CONFUTARE
il rischio prima che entrasse in elenco.

```text
41 rischi confermati · 41 silenziosi · 0 che falliscono a compilazione o in un test
   4 bloccano   31 seri   6 minori
```

### ⛔ I QUATTRO CHE BLOCCANO

**1. `authGuard` rimanda a `'/login'` scritto a mano** — `auth.guard.ts:19`

```text
utente non autenticato → /accesso (non esiste) → wildcard → app/dashboard
                       → authGuard → /accesso → …
```

⛔ **Nessuno raggiunge più la maschera di accesso.** Verificato che nulla lo
intercetta: `check:router-links` legge solo gli `.html` e solo `routerLink`,
mentre questo è un `.ts` con `createUrlTree`. E lo spec resta verde **per
costruzione** — fornisce un Router finto, quindi confronta il letterale della
guardia con una sua copia.

⚠️ Nota di merito dell'agente: la rotta reale è `/login` alla **radice**, non
`/app/login` come dicevo io. Da lei dipendono anche `login/forgot-password` e
`login/reset-password`.

**2. Il link di recupero password nelle EMAIL** — `supabase-auth.gateway.ts:128-130`

**3. Lo stesso link, costruito anche dal BACKEND** — `api/src/admin/admin-tenants.service.ts:480`

⛔ E l'indirizzo `/login/reset-password` è registrato in una **allow-list di
Supabase che sta FUORI dal repository**: nessun grep lo trova, nessun test lo
copre, e il link nell'email smette di funzionare per chi lo riceve.

**4. La sidebar lega ogni voce a DUE letterali** — `shell-layout.component.ts:347-348`
`route` e `activeRoutePrefix`: rinominarne uno solo lascia la voce che naviga
bene e non si evidenzia più, o viceversa.

### ⛔ Il moltiplicatore: il wildcard rende tutto muto

`app.routes.ts:204` — `{ path: '**', redirectTo: 'app/dashboard' }`. Un agente ha
**scritto ed eseguito una sonda** e misurato:

```text
con il wildcard      navigazione RIUSCITA · url = /app/dashboard · nessun errore
senza il wildcard    NG04002: Cannot match any routes
```

⭐ **Non è un difetto da correggere**: è ciò che trasforma ogni indirizzo morto in
«il pulsante porta in dashboard» invece che in un errore. La contromisura è
**procedurale** — spegnerlo _per la durata_ della rinomina.

### I temi degli altri 37

| Tema                                         | Esempi                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Il backend costruisce URL del frontend**   | callback OAuth Shopify e TikTok → `/app/settings`; link email di invito e recupero. Due unità di deploy, nessun confine di compilazione                                                                                                                |
| **Codice che DECIDE confrontando segmenti**  | `parentRoute`/`ACTION_SEGMENTS` (il pulsante Indietro), le briciole (**cinque** confronti cablati, non solo la mappa), la ricerca globale (**due** tabelle di letterali), `CreateClientComponent`, `SECONDARY_PAGES`, i query param dell'hub Documenti |
| **I test restano verdi per costruzione**     | i guard spec mockano `createUrlTree`; lo spec di `parentRoute` si alimenta con letterali inglesi propri; quello della ricerca globale sostituisce la nav reale                                                                                         |
| **Nessuna guardia verifica le destinazioni** | `check:router-links` lo **dichiara** nella propria intestazione, e cita un precedente già avvenuto qui: rotta rimossa il 25/08, link superstite, 4817 test verdi, difetto visibile solo cliccando                                                      |

### ⚠️ Una mia affermazione da correggere

Avevo verificato e detto: «nessuna preferenza salvata dipende dai segmenti di
rotta». È vero **solo se non si tocca `TableViewId`**: la chiave di
`table-column-preference.service.ts:201` finisce con quell'id, e **20 dei 30 id
contengono una parola di rotta** (`products_list`, `sales_orders_list`…). Una
rinomina testuale li prenderebbe e orfanerebbe le preferenze salvate di tutti.

### ⚠️ E il censimento che ho scritto è cieco

`scripts/censimento-rotte.mjs` guarda solo `src/` ed `e2e/`: **non vede
`api/`, `public/`, `docs/` né i file di configurazione** — cioè esattamente dove
stanno i quattro rischi che bloccano. Va esteso prima di usarlo per decidere.

### Il numero che governa tutto

```text
334 letterali di percorso in TypeScript   documents 133 · sales 56 · inventory 40 · products 34 · orders 23
 72 dentro navigate/navigateByUrl
 16 routerLink negli HTML
  0 costanti di rotta                     non esiste nessun path-builder
```

### ⭐ LE TRE PRECONDIZIONI, prima di rinominare qualunque cosa

1. **Le costanti di rotta.** Un solo posto che dichiari i segmenti, e tutto il
   resto che lo importa. Senza, ogni rinomina è 334 sostituzioni a mano.
2. **Il wildcard spento durante il lavoro**, così i letterali rimasti si
   annunciano come `NG04002` invece che come un atterraggio in dashboard.
3. **Una guardia che verifichi le DESTINAZIONI**, non solo la forma: anche in
   `.ts`, anche dentro `createUrlTree` e `navigate`, e anche in `api/`.

⚠️ E il backend va trattato come un consumatore esterno: i suoi URL non li
protegge nessun compilatore, e la allow-list Supabase non sta nemmeno nel
repository.

---

## 3-bis. ⛔ LA VERA DOMANDA NON È LA LINGUA: È LA STRUTTURA _(30/08/2026)_

⚠️ **Scoperto discutendo i nomi, non cercandolo.** Il proprietario ha chiesto
perché `sales` e `orders` si chiamino su due assi diversi, e la risposta ha
spostato tutto il lavoro.

```text
rotte      dashboard products inventory orders suppliers documents sales customers reports guide settings admin
cartelle   dashboard products inventory orders suppliers documents sales-orders customers reports guide settings admin
```

⛔ **Le rotte ricalcano le cartelle di `features/`, una per una.** Non c'è
nessuna divisione per acquisti e vendite, nessuna logica fiscale: c'è **il layout
del codice finito nella barra degli indirizzi**.

### I sintomi, tutti incontrati senza cercarli

| Sintomo                                         | Causa                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders` (fornitore) e `sales` (cliente)        | due cartelle chiamate così, non una decisione: la stessa cosa nominata per ENTITÀ e per DOMINIO                                                                                                   |
| Ordini cliente sulla **radice** di `/app/sales` | `sales-orders.routes` ha un `path: ''`, quindi la pagina occupa la sezione e gli altri tre rami sembrano suoi figli                                                                               |
| Corrispettivi sotto `/app/sales`                | il componente sta in `features/reports/` ma la voce di menu è in Vendite                                                                                                                          |
| `vendita-al-banco` fuori da tutto               | ⛔ la prova più netta: quell'indirizzo sta lì per un vincolo di ARCHITETTURA — «una feature non importa da un'altra feature», dice il commento — non per una ragione che l'operatore possa capire |

### ⭐ Il criterio, indicato dal proprietario senza chiamarlo così

> **L'indirizzo deve ricalcare il percorso che l'operatore fa col MENU**, perché
> è l'unica struttura che lui conosce. Le cartelle sono un fatto nostro.

Il menu oggi raggruppa così — ed è la mappa da cui ripartire:

```text
Fornitori        → Ordini fornitore
VENDITE          → Nuova vendita al banco · Vendite online · Corrispettivi
CANALI ONLINE    → Ordini Shopify
Clienti · Documenti · Magazzino · Report · Impostazioni
```

### ⛔ Una proposta scartata, e perché non va rifatta

Raggruppare tutto sotto `/app/ordini/` — ordine cliente, ordine fornitore,
shopify, online — **raggruppa per grammatica, non per lavoro**: due ordini hanno
in comune il sostantivo, non il mestiere. Chi compra e chi vende non aprono mai
l'elenco dell'altro, hanno permessi diversi, e stanno in due punti opposti del
menu. In più due delle quattro voci non sono ordini (le vendite online sono
vendite) e i **corrispettivi non avrebbero casa**.

### ✅ Una preoccupazione verificata e infondata

⚠️ «Spostare le rotte separerebbe i riepiloghi che oggi condividono il motore» —
**falso, misurato**: `DocumentListComponent` è montato su **dieci rotte**, alcune
su rami del tutto separati (`/app/vendita-al-banco` sta fuori da `documents` e
usa lo stesso riepilogo). E **nessuna rotta dichiara `providers:` o `resolve:`** —
l'unico meccanismo per cui figli della stessa rotta condividerebbero un'istanza.
Il riuso passa dal componente, non dall'indirizzo.

### Decisioni già prese, che restano valide

|                                   |                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/app/admin/clienti`              | il prefisso `admin` disambigua già dai clienti del negozio: aggiungere un suffisso ripeterebbe ciò che il percorso porta |
| `/app/documenti/registro`         | il segmento genitore dice già di che registro si parla                                                                   |
| `new`/`nuovo` e `edit`/`modifica` | oggi convivono **nelle due lingue**: vanno unificati comunque                                                            |
| `edit` **è** modifica             | `/…/:id/edit` rende la maschera, `/…/:id` il Dettaglio. Già corretti, cambia solo la parola                              |

### ⏸ Cosa manca prima di toccare qualunque rotta

1. **L'esito dell'audit a sette lenti** (permessi, persistenza, navigazione
   composta, backend, superfici esterne, test/e2e, deduzione dall'URL). Se
   qualcosa dipende dalla FORMA attuale dei percorsi, spostare costa più che
   rinominare.
2. **Uno strumento di rinomina che capisca il CONTESTO**, non il testo. Quello
   usato finora sostituisce ogni occorrenza quotata, ed è così che ha rotto
   `quote`. Deve toccare solo `path:`, gli indirizzi `/app/…`, `routerLink`,
   `navigate([...])`, le chiavi delle briciole e i documenti — e **mai** valori di
   enum, chiavi di permesso (`section.products`), viste salvate
   (`products_list`) o scope Shopify (`read_products`).
3. **La decisione di struttura**, che viene prima dei nomi: se gli indirizzi
   ricalcano il menu, alcune pagine si SPOSTANO, e allora non è più una
   rinomina.

⭐ `scripts/censimento-rotte.mjs` dice, per ogni segmento, **quanti mestieri fa**
oltre a essere un indirizzo. ⚠️ Restringe il campo, **non decide**: su `products`
ha trovato due accoppiamenti veri (permesso, vista) e due falsi allarmi (scope
Shopify, un binding di template). La prova va letta.

## 4. ⏸ Elimina: restano nove schermate e due pulizie

Fatto: il componente condiviso, Documenti, Ordini cliente, `edit-client`.

**Restano a conferma singola:** dettaglio documento, dettaglio prodotto,
dettaglio ordine fornitore, utenti, codici IVA, elenco inventari, maschera
Corrispettivo manuale, pannello allegati.

**E due pulizie:** «Elimina» dal catalogo negli elenchi che non ce l'hanno, e via
il duplicato dal menu di riga di Ordini cliente — che è scritto a mano e per
questo sfugge a `check:list-actions`.

---

## ⛔ ELIMINARE UN ORDINE DI CANALE — dubbio dichiarato, non risolto _(30/08/2026)_

> _«Su corrispettivi forse sarebbe giusto poter eliminare, altrimenti non ci
> sarebbe mai modo di farlo. Quello che poi va gestita è la sincro con Shopify,
> che non dovrebbe sempre riportare ordini già cancellati. Ma si avrebbero
> problemi di sincro immagino. È una cosa che va risolta.»_ — il proprietario

⭐ **La regola di prodotto è chiara e vale già**: _«se elimino un ordine, si
dovrebbe eliminare il corrispettivo»_. La cancellazione si fa **sull'ordine**, e
il registro segue.

⭐ **La conseguenza immediata è stata applicata**: nel Registro si può scegliere
**solo il Corrispettivo manuale** — l'unica cosa che nasce lì. Le righe che
vengono da un ordine restano consultabili e non selezionabili.

## ⏸ Ma il problema di fondo resta aperto, ed è di SINCRONIZZAZIONE

Se un ordine Shopify si elimina nel gestionale, **il prossimo scarico lo
riporta**: per Shopify quell'ordine esiste ancora, e la nostra cancellazione è
invisibile. Oggi il codice lo dice esplicitamente — «gli ordini di canale non si
eliminano: appartengono a Shopify, e il prossimo scarico li riporterebbe» — e
consente l'eliminazione solo di quelli che **su Shopify non risultano più**
(`channelMissingSince`).

⚠️ **Le domande da chiudere**, e nessuna ha oggi una risposta nel codice:

| Domanda                                                                 | Perché non è banale                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Eliminare da noi deve **cancellare anche su Shopify**?                  | è l'unica cancellazione che non torna indietro, ma è distruttiva su un sistema che non possediamo            |
| Oppure serve una **lista di esclusi** che il sync non reimporta?        | cresce senza fine, e un ordine escluso per errore sparisce per sempre senza che nessuno se ne accorga        |
| Oppure si «elimina» solo **dal registro**, lasciando vivo l'ordine?     | contraddice la regola del proprietario — sarebbero due verità diverse sullo stesso fatto                     |
| E un ordine cancellato su Shopify **dopo** essere entrato nel registro? | fiscalmente il corrispettivo di un giorno chiuso non si riscrive: è una **rettifica**, non una cancellazione |

⛔ **L'ultima riga è la più importante e cambia la forma della risposta**: un
registro dei corrispettivi è un documento fiscale. Cancellare una riga di un
giorno già chiuso non è un'operazione di database — è una rettifica, che il
registro sa già rappresentare. Prima di scrivere codice va deciso **se
«eliminare» qui significhi davvero eliminare**, o rettificare.

---

## ✅ La selezione di riga su Corrispettivi — fatta il 30/08/2026

⛔ **Qui c'erano due domande aperte**, entrambe chiuse dal proprietario lo stesso giorno:

- **il riepilogo segue la selezione** — sommando i valori di riga, che sono già finali
  (`docs/14` §0-bis, «sommare non è ricalcolare»). ⚠️ Avevo scritto che fosse vietato: era
  falso, ed è stato corretto;
- **«Annullamenti» resta del periodo**, perché non è una riga del registro.

⏸ **Resta aperto solo cosa fanno le AZIONI**: Stampa, Excel ed Esporta agiscono ancora
sull'elenco filtrato, non sulla selezione. Toccarle significa toccare stampa ed export, non
solo la UI.

⭐ La forma della selezione — caselle su scrivania, modalità «Seleziona» nella vista a card
— è in `docs/14` §0-ter.

---

## ✅ Il motore comune li ha presi TUTTI — chiuso il 31/08/2026

⛔ Qui c'era l'elenco dei quattro rimasti fuori (clienti, prodotti, giacenze,
situazione) e la nota che «document-table copre più elenchi di quanti sembri».

**Sono dodici su dodici**, e l'ultimo — i **fornitori** — non era nemmeno in quella
lista: aveva una `<table>` scritta a mano e non usava `app-data-table`, quindi il
conteggio non lo vedeva. È il tipo di svista che una lista scritta a mano produce,
ed è la ragione per cui le guardie di questo progetto **cercano** invece di
elencare.

⭐ Ognuno ha ora: taglio a colonna, altezza di riga dichiarata, maniglia visibile,
riga totali, card progettata a tre fasce e piede ancorato sotto `lg`.

⏸ **Tre non hanno la selezione** — Inventario, Giacenze, Vendite online — perché
non hanno azioni che la usino. Ora che la riga totali segue la selezione, resta
comunque una differenza fra elenchi: va decisa, non lasciata cadere.

## ⏸ Due domande di forma rimaste aperte — 30/08/2026

1. **I due verdi del telefono.** «Vendite» e «Corrispettivo» usano `--color-ok` sotto `lg`
   e `--color-primary` sopra. Il proprietario ha chiesto il verde la mattina e
   l'allineamento ai colori della scrivania la sera: le due indicazioni si contraddicono, e
   **non è stata presa una decisione al posto suo**. O si allineano al navy, o il verde sale
   anche sulla scrivania.

2. **L'allineamento dei totali su tablet.** Fra 768 e 1024px le colonne della fascia sono
   larghe ~240px per ~60px di contenuto: la forma del telefono applicata a una larghezza da
   scrivania. Nessuna decisione presa.

---

## ⛔ Il richiamo articolo rilegge il catalogo a ogni battuta — misurato 29/08/2026

Il blocco `selectedVariantIds` + `pinnedVariants` è copiato identico in **quattro**
maschere. Solo l'Ordine fornitore ha il `distinctUntilChanged`: sulle altre tre —
**Arrivo merce**, **Carico/scarico/rettifica**, **Trasferimento** — ogni carattere
digitato in una riga rilegge una variante per articolo del documento.

Il rimedio non è la stessa toppa tre volte: il blocco va **estratto una volta**, accanto
a `document-line-article.service.ts`. Con lui conviene il passaggio a una lettura sola
(`variantIds[]` nel DTO API, nessuna migrazione): l'apertura di un documento da 50 righe
passa da 100 chiamate a 2.

Misure e tabella in `14` §0.2.

## ⛔ LA VIRTUALIZZAZIONE È DIVENTATA UN PREREQUISITO — 30/08/2026

Era il **punto 2** di un piano in tre passi, ed era descritta come un'ottimizzazione. Non
lo è più.

_Decisione del proprietario, lo stesso giorno:_

> «Non deve esserci nessun limite di visualizzazione. Se il cliente ha il filtro di 30
> giorni, deve sapere vedere il totale di quel periodo, anche se si tratta di vedere mille
> ordini. **Questo vale ovunque.**»

⭐ **Il tetto di 25 righe su schermo compatto è stato tolto** dal Registro Corrispettivi, e
la regola vale per ogni elenco. Il problema che il tetto risolveva — arrivare ai totali
senza scorrere centinaia di card — lo risolve il **piede ancorato** (`regole-stile-ui`).

⛔ **Ma senza tetto, mille righe sono mille card nel DOM**, e il motore tabella non
virtualizza:

```text
righe    nodi DOM (card mobile, ~6 nodi ciascuna)
   25         150
  300       1.800
1.000       6.000
5.000      30.000     ⛔ qui il primo disegno costa secondi
```

⚠️ **Non è più «si può fare dopo»**: la decisione di mostrare tutto è già presa e già
applicata, quindi l'unica cosa che tiene in piedi il caso «mille ordini in 30 giorni» è la
virtualizzazione. Va misurata e fatta.

⭐ **E vale per la CARD, non solo per la tabella.** La tecnica descritta più sotto —
altezza di riga nota e uguale — sulla tabella funziona; sulla card no, perché le card hanno
altezze diverse. Serve una misura per card, o un'altezza dichiarata. È il pezzo che manca
al piano.

## ⭐ TOGLIERE L'IMPAGINAZIONE dalle anagrafiche — deciso il 30/08/2026

_Il proprietario: «mettere un tetto alla visualizzazione di clienti e prodotti rende
difficile la gestione», e poi «per sistemare tutto, a questo punto, conviene togliere le
impaginazioni»._

Ha ragione, ed è la stessa cosa che fanno i gestionali di riferimento: **Danea non impagina
le anagrafiche**, mostra l'archivio intero in una griglia che scorre. Su un'anagrafica
spesso non sai cosa cerchi — **scorri per riconoscerlo** — e «pagina 3 di 250» è una domanda
a cui l'operatore non sa rispondere.

⛔ **Ma è l'ULTIMO dei tre passi, non il primo.** Toglierlo per primo peggiora tutto:

```text
oggi, pagina da 20      30 kB di rete ·     220 nodi DOM
tetto tolto, così       7,4 MB di rete · 115.000 nodi DOM   ⛔
tetto tolto, dopo 1 e 2 1,3 MB di rete ·     900 nodi DOM   ✅
```

⚠️ **Danea è un'applicazione DESKTOP** con il database sulla stessa macchina: «tutto» gli
costa niente. Una web app paga la rete a ogni riga, e i due passi qui sotto sono ciò che
colma quella differenza.

---

### 1 ⭐ LA RIGA MAGRA — l'API manda 47 campi per mostrarne 9

**Misurato il 30/08/2026 sull'elenco prodotti.**

`PRODUCT_LIST_SELECT` (`api/src/products/products.service.ts`) chiede **47 colonne**. La
tabella dell'elenco ne legge **nove**:

```text
articleCode · brand · catalogOrigin · id · name · options · season · shopify · status
```

Gli altri 38 partono dal database, attraversano la rete, arrivano nel browser e **nessuno
li guarda**: `shopifyMetafields`, `shopifyCollections`, `seoTitle`, `seoDescription`,
`shopifyTaxonomyCategoryFullName`, i tre listini, i cinque campi TikTok, `internalNotes`,
`description`.

**«Riga magra» significa una cosa sola: l'endpoint dell'elenco restituisce una forma sua,
con i soli campi dell'elenco.** Il prodotto completo resta quello che si carica aprendo la
scheda, dove serve davvero.

|                                | riga di oggi | riga magra              |
| ------------------------------ | ------------ | ----------------------- |
| una riga                       | 1.525 B      | **270 B** — 82% in meno |
| 5.000 articoli                 | 7,4 MB       | **1,3 MB**              |
| 30 aziende insieme, picco Node | 218 MB       | **39 MB**               |

⚠️ **I 218 MB sono un picco simultaneo**, non una media: `JSON.stringify` tiene la stringa
intera in memoria prima di scriverla sul socket. Su un container da 512 MB, trenta richieste
contemporanee lo saturano.

⭐ **Verificata fattibile, non solo desiderabile.** Il rischio era che qualcosa leggesse la
riga intera: la duplicazione — l'unico sospetto — chiama `duplicateProduct(product.id)`,
manda **solo l'id** e il resto lo fa il server. Nessun ostacolo trovato.

⭐ **Conviene anche se il tetto restasse**: oggi una pagina da 20 articoli trasferisce
30 kB per mostrarne 5.

**Il lavoro**: un `select` di elenco distinto da quello di dettaglio, per prodotti,
clienti, fornitori, giacenze e vendite online. Nessuna migration, nessun cambio di schema.

---

### 2 ⭐ VIRTUALIZZARE il motore tabella

Il browser tiene **tutte** le righe in memoria, ma ne **disegna** solo le ~40 visibili.

```text
contenitore     altezza dichiarata: 5.000 × 30px = 150.000px
  ├─ blocco vuoto alto quanto le righe SOPRA la vista
  ├─ ~40 <tr> veri     ← le uniche che esistono nel DOM
  └─ blocco vuoto alto quanto le righe SOTTO
```

La barra di scorrimento è vera perché il contenitore è davvero alto. Scorrendo, il codice
calcola `prima riga = scorrimento ÷ altezza riga` e **riscrive il contenuto** di quelle
stesse quaranta `<tr>` — non le crea e non le distrugge.

⛔ **Non è il caricamento progressivo** (_infinite scroll_), e la differenza decide
l'ordinamento:

|                            | virtualizza il DOM       | carica scorrendo                         |
| -------------------------- | ------------------------ | ---------------------------------------- |
| dati nel browser           | **tutti**                | solo quelli scaricati                    |
| **riordinare una colonna** | ⭐ istantaneo e corretto | ⛔ lo rifà il server, si riparte da capo |
| filtrare, cercare          | istantaneo               | round-trip                               |

⭐ **Risolve l'ordinamento senza toccare l'API**: se il client ha tutte le righe, ordinare è
un `sort` su un array — niente `orderBy` Prisma, niente lista bianca, niente DTO. Rende
superfluo il lavoro descritto nella sezione «Quattro API non sanno ordinare» qui sotto.

⚠️ **Richiede altezza di riga nota e uguale per tutte**, quindi non si applica alla vista a
card mobile: lì serve una tecnica diversa, o si lascia non virtualizzata.

⚠️ **Un'azione su una riga oggi ricarica la pagina da 20.** Senza tetto ricaricherebbe
5.000 righe a ogni eliminazione: va aggiornata **la sola riga toccata** in memoria. È lavoro
in più rispetto a oggi, e va messo in conto.

⚠️ **Regge comodamente fino a ~50.000 righe** — dieci volte i numeri dichiarati (5.000
articoli, 3.000 clienti). Oltre le 200.000 sarebbe un'altra conversazione.

---

### 3 ⭐ E la vista di serie non è «tutto»: è «tutto quello che è vivo»

Articoli attivi, clienti non archiviati. «Tutto tutto» diventa un filtro che si accende.
Riduce il carico senza togliere niente — nessuno lavora sugli archiviati per sbaglio.

---

### ✅ Deciso e NON da fare: lo staleness

_Il proprietario, 30/08/2026: «per ora questo va bene»._

Nessun polling, nessun avviso «aggiornato alle 14:32», nessun canale in tempo reale.
L'operatore ricarica quando gli serve.

⚠️ Misurato lo stesso giorno: **è già così oggi** — nessun WebSocket, nessun SSE, nessun
ricaricamento al ritorno sulla scheda. Una pagina da 20 righe è già una fotografia, quindi
togliere il tetto non introduce il problema. Lo rende solo più visibile, perché su un elenco
senza tetto ci si sta più a lungo.

## ⏸ Quattro API non sanno ordinare — misurato 30/08/2026

L'ordinamento di colonna è una capacità del **motore comune**, e sugli elenchi paginati
funziona solo se l'API lo applica **prima** di impaginare.

```text
sanno ordinare      corrispettivi · documents · sales-orders · supplier-orders
NON sanno ordinare  suppliers · customers · inventory · online-sales
```

Nei quattro che non sanno, il DTO non ha un parametro `sort` e l'`orderBy` è cablato.

⛔ **La toppa lato client è peggio del buco.** Ordinare l'array già ricevuto riordina la
**pagina corrente** — venti righe su centoventisette — e l'intestazione si comporta come
se avesse funzionato. Chi ordina per «Totale» decrescente e legge la prima riga crede di
avere il documento più alto: ne ha il più alto fra venti.

Quindi finché l'API non c'è, quelle colonne dichiarano `sortable: false`, che è la
verità. Vendite online è già così (30/08/2026).

**Il lavoro**: parametro `sort` nei quattro DTO, mappatura colonna → `orderBy` con una
lista bianca (mai il nome di colonna grezzo dentro Prisma), e poi `sortable` torna al suo
valore di serie — che è acceso.

## ⏸ La sede è «Sede» negli elenchi, non ancora nei nomi accessibili — 30/08/2026

La decisione di `14` §15 è **applicata** a colonne di elenco, filtri visibili e schede di
dettaglio, ed è tenuta ferma da `npm run check:column-catalog`.

⛔ **Restano indietro i nomi ACCESSIBILI e la topbar**, e sono stati lasciati apposta:
cambiarli rompe due specifiche e2e che non si possono eseguire senza un server, quindi la
correzione va fatta insieme al loro aggiornamento, non prima.

| Dove                                                                   | Quante | Dice ancora                |
| ---------------------------------------------------------------------- | ------ | -------------------------- |
| `ariaLabel` dei filtri sede (5 elenchi)                                | 5      | «Filtra per location»      |
| topbar, selettore sede attiva                                          | 3      | «Tutte le location»        |
| `e2e/permissions-owner.spec.ts:143,149` · `e2e/permissions.spec.ts:89` | 3      | agganciano quelle stringhe |

⚠️ **Un `ariaLabel` è testo che qualcuno legge** — glielo pronuncia lo screen reader — e
sta nell'elenco di §15 come «etichetta di filtro». Non è un identificatore tecnico, e
lasciarlo «location» significa che chi non vede sente una parola che sullo schermo non c'è.

⚠️ **E non è un'uniformazione da fare in blocco.** Alcuni «Magazzino» sono **giusti** e non
sono la sede: la sezione di navigazione, la scheda dell'articolo, la colonna «impegna
magazzino» di una riga documento. Il criterio è §15 — si cambia dove la parola nomina **la
location** — e restano da rileggere, quando si toccano, titoli di stampa, intestazioni di
export, testi di aiuto e messaggi di errore.

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
| **niente paginazione** su OGNI elenco, anagrafiche comprese                           | `14` §11.4     |
| **filtri derivati dalle colonne**, con il pulsante che li accende e azzera            | `14` §0.2      |

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

#### Stato al 01/09/2026 — l'anagrafica FORNITORE è fatta, le altre no

Rifatta per intero (larghezze per contenuto, ordine di battitura, densità a 28px, sezioni
piatte allineate, avvisi di digitazione). Il giro del Tab è stato **verificato in un browser
vero**: 26 fermate in ordine di DOM, dalla ragione sociale ai due pulsanti, nessuna trappola,
la cella del Codice IVA raggiunta come ogni altro campo. La forma è in `regole-stile-ui`
§7-bis.

⭐ **E l'anagrafica ha tre dati in più — 01/09/2026**, chiesti dal proprietario davanti alle
schede Danea: **IBAN**, **Cellulare**, **Ns. banca**. L'IBAN era il solo davvero essenziale:
un fornitore lo si paga con un bonifico, la modalità di pagamento c'era già ma il numero con
cui il bonifico si fa no.

**La divisione fra le due tabelle non è arbitraria**, e vale come precedente per il cliente:

```text
iban          → parties     è il conto di CHI INCASSA, cioè del soggetto
mobile_phone  → parties     è un recapito del soggetto, come `phone`
our_bank_name → suppliers   è la NOSTRA banca per questo rapporto
```

Danea li mostra nella stessa scheda perché non separa soggetto e ruolo; VestiFlow sì, e il
commento di `Party` lo dichiara. Quindi **il cliente eredita IBAN e cellulare senza
migration**: le colonne sono già sue.

⚠️ **Restano non aggiunti, e per una ragione**: Fido e Conto acq. presuppongono un
affidamento e un piano dei conti che VestiFlow non ha — sarebbero caselle che nessuno
riempie. Fax è obsoleto. Indirizzi e contatti multipli («Aggiungi indirizzo…») sono un
lavoro a sé, non un campo.

⚠️ **Restano da fare: cliente, articolo, Impostazioni.** `customer-form-fields` è oggi la
copia esatta del difetto corretto qui — griglia a due colonne uguali, nessun controllo su
P. IVA, codice fiscale, CAP e provincia, `font: inherit` sugli input (13px: sotto la soglia
iOS). I controlli fiscali sono già pronti e condivisi in `src/app/domain/fiscal/`.

⛔ **E c'è un difetto di dominio trovato per strada**, che non riguarda la veste: il Codice
IVA del fornitore non arriva sugli articoli creati da Arrivo merce se le righe si aggiungono
DOPO aver scelto il fornitore — cioè nell'ordine naturale dei gesti. Misure, catena e
divergenza dell'Ordine fornitore in `docs/03c-contratto-risolutore-riga.md` §P1.

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
DDT vendita   Confermato · STAMPATO · INVIATO · Annullato
Fattura       Da emettere · INVIATA AL COMMERCIALISTA · Annullata
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

## ⏸ QUANDO SI FA: **alla fine di tutti i lavori** — deciso il 30/08/2026

_Il proprietario: «la virtualizzazione la inserirei nel documento da fare e la riprenderei alla
fine di tutti i lavori»._

⭐ **Non è un rinvio prudenziale: è l'ordine che costa meno**, e la ragione è che la
virtualizzazione va scritta contro un motore FERMO. Il motore tabella sta ancora prendendo forma —
il 30/08 ha preso `table-layout: fixed`, i divisori di colonna e il taglio a colonna; deve ancora
prendere la **riga totali**, che si incolonna con le colonne, e tre elenchi devono ancora
entrarci. La virtualizzazione tocca **esattamente** quelle cose: altezza di riga, intestazione
appiccicata, allineamento delle colonne. Scritta prima, si riscrive dopo.

### ⭐ E il lavoro del 30/08 è il suo PREREQUISITO, non un suo rivale

Una lista virtualizzata deve sapere **quanto è alta una riga** per calcolare quali disegnare.
Fino al 30/08 l'altezza dipendeva dal contenuto: un nome lungo mandava la riga a due righe di
testo. Il **taglio a colonna** l'ha resa costante — cioè ha appena reso la virtualizzazione
scrivibile.

### ⛔ L'impaginazione si toglie PRIMA, non dopo — corretto il 30/08/2026

⛔ **Qui c'era l'ordine opposto**, scritto un'ora prima: «l'impaginazione va tolta AL PASSO 3»,
insieme alla virtualizzazione, «la stessa modifica fatta una volta invece di due».

⭐ **Il proprietario l'ha ribaltato con una frase**: _«se non togli l'impaginazione non possiamo
ottimizzarla»_. Ed è dirimente: **con dieci righe a pagina il costo di un elenco lungo non si
manifesta mai.** Non lo si può misurare, non lo si può tarare, e la virtualizzazione resterebbe
una scelta al buio — cioè esattamente ciò che questo documento rimprovera altrove («il numero va
scelto su dati reali»).

⚠️ **L'argomento che avevo usato era vero e irrilevante**: sì, sono due modifiche invece di una.
Ma la seconda non si può nemmeno progettare finché la prima non è fatta, quindi il risparmio non
esisteva.

### L'ordine, corretto

```text
1. togliere l'impaginazione      ✅ fatto sui PRODOTTI il 30/08
2. finire la forma del motore    riga totali · spazi · gli ultimi tre elenchi
3. virtualizzare                 alla fine, con il costo finalmente visibile e misurabile
```

✅ **Finito, e questa riga era testo morto.** Diceva «restano cinque elenchi che impaginano
ancora: Clienti, Fornitori, Giacenze, Situazione magazzino, Vendite online». **Non è più vero
dal 30/08**: nessun elenco impagina, e il 02/09/2026 il componente `app-pagination` è stato
rimosso perché non lo montava più nessuno.

⚠️ **L'ha trovato il censimento del codice morto, non una rilettura**: cercando i componenti
mai usati è emerso che il paginatore era orfano, e leggendo _perché_ si è scoperto che questa
riga lo dava ancora per vivo. È lo scarto che `regole-qualita` §«Testo morto nelle specifiche»
descrive — un documento che afferma un arretrato già chiuso.

⭐ **Il meccanismo lato API esisteva già** e non è stato inventato per l'occasione:
`UnpagedQueryDto` + `pageWindow` li usano documenti, ordini cliente, ordini fornitore e
inventario dal 21/08. Sui prodotti è bastato aggiungere `all?: boolean` al DTO e sostituire lo
`skip`/`take` scritto a mano.

⛔ **Il rischio, dichiarato**: da ora un elenco lungo è lento davvero, e si vedrà. **È lo scopo**
— ma va detto, perché la prima segnalazione di lentezza non sarà una regressione: sarà la misura
che serviva.

⚠️ **Oggi resta comunque quasi nullo**: nessun cliente usa il gestionale e il catalogo di prova
ha 50 articoli.

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

## Filtri per colonna — perimetro misurato il 29/08/2026

Mappa avversariale (7 agenti, 2 di sola smentita), riverificata a mano. Decisioni in
`14` §11.4 e §11.5; qui c'è solo cosa resta da fare.

| Da fare                                                                                                                            | Dove          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **intestazione fissa**: dare uno scrollport verticale a `.data-table-scroll`                                                       | `14` §11.5 D3 |
| **togliere il tetto di righe** sui sei elenchi col paginatore (clienti, fornitori, prodotti, giacenze, situazione, vendite online) | `14` §11.4    |
| **tre colonne nuove**, spente di serie: Operatore, Controparte, Location                                                           | `14` §11.5 D1 |
| `cellText` non copre `status` e `linkStatus`: il filtro a valori nascerebbe vuoto                                                  | `14` §11.5    |
| `filter: false` sulle 9 pseudo-colonne (`select`, `actions`)                                                                       | `14` §11.1    |
| `filter: 'range'` sulle 11 colonne data: nessuna lo deduce                                                                         | `14` §11.1    |
| escludere le 91 colonne di RIGHE documento dalla filtrabilità                                                                      | `14` §11.5    |
| ✅ ~~portare `corrispettivi-orders-table` e `online-sale-table` sul contratto colonne~~ — **fatto il 30/08/2026**                  | `14` §11.5    |
| veste filtri mobile per sei elenchi che non ce l'hanno                                                                             | `14` §0.2     |
| `filter` in `document-line-columns.consistency.spec.ts:80`                                                                         | `14` §11.5    |
| l'e2e `permissions-owner.spec.ts:143` aggancia `'Filtra per location'` per nome                                                    | `14` §11.5    |
| il commento `data-table.component.ts:48-51` dice ancora «paginati lato server»                                                     | `14` §11.4    |

⚠️ **Da guardare a schermo, non con i test**: che l'intestazione resti davvero fissa
scorrendo un elenco lungo. Un `sticky` che non appiccica non fallisce — non fa niente.

---

## ⏸ Il residuo negativo e il modello ENTRATE / USCITE — 31/08/2026

> _«Registrazione fattura fornitore avrà colonna entrate ed uscite e una delle
> differenze.»_ — proprietario

⭐ **È la forma che risolve il difetto trovato**, e risolve anche perché il
rimedio ovvio non era quello giusto.

### Il difetto misurato

`goods-receipt-workflow.service.ts:1174` calcola

```ts
const outstandingMinor = Math.max(0, totalMinor - settledMinor);
```

e su quel documento **un importo negativo è legittimo**: in Registrazione
fattura entrano anche le **note di credito del fornitore**, e
`save-purchase-invoice.dto.ts` è l'unico DTO monetario del progetto senza
`@Min(0)` — con un test che lo dichiara voluto.

⛔ **Conseguenza**: una nota di credito da −146,40 € risulta **saldata**, e
l'esposizione sommata non scende mai. In quattro punti — colonna, riga totali,
PDF, maschera — tutti coerenti con quello zero e tutti sbagliati.

⚠️ **Aggravante**: le rate hanno `@Min(0)`, quindi la scadenza negativa che
chiuderebbe il conto **non è nemmeno registrabile**.

### Perché «togliere il clamp» NON è la risposta

Un «Ancora da saldare» che scende sotto zero dice una cosa che quella colonna
non significa: sotto zero non c'è nulla _da saldare_, c'è un **credito**. Sono
due grandezze diverse costrette in una colonna sola.

⭐ **Il modello deciso sono TRE colonne**: entrate, uscite, e la differenza fra
le due. Ogni riga contabile sta dalla sua parte, e il saldo è una sottrazione
esplicita invece di un numero che cambia significato col segno.

### Da fare, e da decidere prima

- [ ] verificare **come si tratta contabilmente** un credito verso fornitore
      (indagine chiesta dal proprietario, non ancora fatta)
- [ ] definire che cosa entra in «entrate» e che cosa in «uscite» per la
      Registrazione fattura
- [ ] togliere `@Min(0)` dalle rate, o dichiarare quale altra forma chiude il
      conto
- [ ] ⚠️ **anche gli ORDINI gestiscono i negativi** (indicato dal proprietario):
      il perimetro non è la sola Registrazione fattura

⛔ **Fino ad allora nulla si tocca.** Il clamp resta, e con lui il commento
sbagliato che avevo scritto nella riga totali — «il residuo l'ha già scalato»:
non lo scala, glielo impedisce il clamp.
