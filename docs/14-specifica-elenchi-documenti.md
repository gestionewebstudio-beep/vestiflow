# 14 · Elenchi documenti: apertura, selezione, dettaglio e stampa

**Stato:** decisione funzionale adottata come regola comune
**Data:** 20/08/2026
**Ambito:** gli elenchi dei documenti gestionali VestiFlow che hanno una maschera operativa

> **Perimetro.** Vale per **tutti i documenti che hanno un riepilogo** (elenco), non per la
> sola Vendita al banco. È la ragione per cui questa specifica è trasversale e non vive
> dentro `11`.

---

## 1. Obiettivo

Uniformare il comportamento degli elenchi documentali di VestiFlow.

L'utente deve distinguere senza ambiguità tre azioni diverse:

1. **aprire un documento per lavorarci/modificarlo**;
2. **selezionare uno o più documenti** per azioni contestuali o massive;
3. **vedere/stampare l'anteprima del documento**.

Queste azioni non devono essere sovrapposte allo stesso gesto.

La soluzione prende come riferimento la semplicità operativa di Danea, adattandola a
VestiFlow, che gestisce varianti, SKU, immagini, righe documento e operazioni web/mobile.

---

## 2. Regola principale: clic sulla riga = modifica

Per un documento gestionale VestiFlow modificabile:

```text
clic sulla riga
→ apre direttamente la maschera del documento in modifica
```

Il clic sulla riga **non seleziona** e **non apre una pagina di dettaglio read-only**.

La destinazione primaria di un documento è la sua maschera operativa.

```text
Vendite al banco
VN-2026-0001
→ clic sulla riga
→ /app/vendita-al-banco/vendita/<id>/edit
```

La stessa grammatica va adottata da tutti gli elenchi documentali che hanno una maschera
modificabile.

### 2.1 Eccezione

Se un'entità è per dominio realmente non modificabile / importata / di sola consultazione,
non si deve creare una falsa maschera editabile solo per uniformità. In quel caso il
comportamento resta quello previsto dal dominio specifico.

---

## 3. Nessun doppio clic e nessun «primo clic seleziona, secondo clic apre»

È esplicitamente scartato il comportamento:

```text
primo clic   → seleziona
secondo clic → apre
```

Motivi:

- rende ambiguo il clic singolo;
- rallenta l'operazione più frequente;
- non è naturale su touch/mobile;
- rende più difficile capire lo stato corrente;
- introduce differenze fra mouse e touchscreen.

L'apertura deve restare immediata con un solo clic sulla riga.

---

## 4. Selezione: checkbox esplicita

La selezione avviene tramite una **checkbox dedicata**.

```text
☐ | Data | Numero | Tipo | Cliente | Totale | ...
```

Comportamento:

```text
clic sulla riga      → modifica
clic sulla checkbox  → seleziona/deseleziona senza navigare
```

Il clic sulla checkbox deve fermare la propagazione dell'evento di riga.

### 4.1 Checkbox di testata

La testata della tabella può avere una checkbox generale.

La selezione generale deve rispettare il contratto già adottato dal componente elenco
comune. Se non esiste ancora una regola comune, il comportamento prudente è:

> selezionare/deselezionare le righe attualmente caricate e appartenenti al sottoinsieme
> filtrato visibile, senza fingere di aver selezionato record non caricati.

Non introdurre una semantica «seleziona tutto il database» senza un contratto API esplicito.

---

## 5. Barra azioni — permanente, non contestuale _(rivisto il 20/08/2026)_

⚠️ **Qui c'era «quando è selezionato almeno un elemento, COMPARE una barra di azioni
contestuali».** È superato: a zero selezionati i comandi non si vedevano affatto.

> **Le azioni della pagina sono sempre visibili. La selezione non le fa comparire: ne
> cambia l'ambito.**

```text
0 selezionati   [ Stampa ] [ Excel ] [ Esporta ▾ ]              → ambito «filtered»
3 selezionati   3 selezionati · Deseleziona
                [ Stampa ] [ Excel ] [ Esporta ▾ ]              → ambito «selection»
```

⭐ **I comandi non si spostano mai.** Un pulsante che salta da un punto all'altro quando si
spunta una casella è peggio di uno che sta fermo: la mano ha già imparato dov'è.

### I tre stati, e vanno tenuti distinti

| Stato                                         | Come si esprime                          |
| --------------------------------------------- | ---------------------------------------- |
| l'azione **appartiene** alla pagina           | visibile                                 |
| l'azione è **momentaneamente non eseguibile** | visibile ma **disabilitata, con motivo** |
| l'azione **non è prevista** per pagina o tipo | **non dichiarata affatto**               |

⛔ **Non esiste un quarto stato «nascosta».** Il contratto non ha più un campo `visible`:
se un'azione non è della pagina, la pagina non la dichiara — e lo stato sbagliato diventa
irrappresentabile invece che sconsigliato.

⛔ **Niente funzioni importanti dietro un «···» generico.** Su mobile i comandi possono
compattarsi come nei Corrispettivi, ma dentro **menu nominati e riconoscibili**, mai in un
overflow anonimo.

La selezione non deve impedire all'utente di aprire comunque un altro documento facendo
clic sulla sua riga.

Permessi, tenant e vincoli del documento devono essere verificati anche lato backend: la
toolbar non è una barriera di sicurezza.

### 5.0 `requires`: che cosa un'azione pretende

⚠️ Ha sostituito `supports: single | multiple | any`, e **non è un rinominare**: il campo ha
cambiato mestiere. Prima decideva se l'azione _compariva_; ora che i comandi ci sono sempre,
decide se è **abilitata** e con quale motivo.

| `requires`    | 0 selezionati                           | 1      | 2+                                    |
| ------------- | --------------------------------------- | ------ | ------------------------------------- |
| `'none'`      | attiva, ambito `filtered`               | attiva | attiva                                |
| `'oneOrMore'` | spenta — «Seleziona almeno un elemento» | attiva | attiva                                |
| `'one'`       | spenta — «Seleziona un elemento»        | attiva | spenta — «Seleziona un solo elemento» |

⛔ **`'none'` non vuol dire «non serve niente»**: vuol dire che l'azione **sa lavorare sul
risultato filtrato**. Stampare l'elenco filtrato ha senso; eliminarlo no — ed è la
differenza che questo campo esiste per esprimere.

⭐ **`requires` descrive quello che l'azione sa fare OGGI, non l'intenzione.** Stampa ed
Esporta degli elenchi documentali e ordini valgono sulla selezione, perché il percorso
server-side che conosce il filtro non c'è ancora: dichiarano `'oneOrMore'`, e a zero
selezionati dicono «Seleziona almeno un elemento» — che è vero. Diventeranno `'none'` il
giorno in cui quell'export esiste, e la frase sparirà da sola.

⚠️ **Qui c'era un motivo transitorio condiviso** («Non ancora disponibile su tutto il
risultato filtrato»), usato per tenerle `'none'` e spente. È stato tolto: un'azione che
funziona benissimo su una selezione non è «non disponibile» — è un'azione che **vuole una
selezione**, e il contratto sa già dirlo. **Excel di Ordini fornitore resta `'none'`**,
perché lì l'endpoint che conosce il filtro c'è davvero.

### 5.0.2 Dove sta la barra

Le azioni dell'elenco vivono nella **testata**, accanto al titolo e ai comandi di creazione:
è la grammatica del Registro Corrispettivi, dove «Nuovo corrispettivo» e gli export stanno
nella stessa riga.

⛔ **Il contenitore delle azioni non sta dentro un `@if` di permesso**: le azioni
dell'elenco ci sono anche per chi non può creare niente. Nell'elenco documenti il `@if`
avvolge ora i soli pulsanti «Nuovo …», non la riga.

⚠️ **Stato al 20/08/2026: spostata sull'elenco documenti** (che serve otto profili). Ordini
cliente e Ordini fornitore hanno testate di forma diversa e la barra è ancora sopra la
tabella: vanno allineati guardandoli a schermo, non alla cieca.

⛔ **I motivi standard li produce il contratto comune**, mai le pagine: scritti pagina per
pagina diventerebbero la stessa frase in tre sfumature. `disabledReason` resta per i vincoli
di dominio, che sono più specifici e quindi vincono su quelli di arità.

### 5.0.1 ⭐ Una spiegazione che si raggiunge anche senza mouse

> **Ogni azione disabilitata dice perché, a mouse E a tastiera.**

⛔ **Un `<button disabled>` nativo non è raggiungibile col Tab**, quindi la sua ragione non
è leggibile da tastiera in nessun modo. Le azioni degli elenchi usano perciò
`aria-disabled` — il pulsante resta focusabile e il clic lo blocca il componente.

⚠️ **È una modalità opt-in di `app-button` (`softDisabled`), e deve restarlo**: il
`disabled` nativo è la scelta giusta quasi ovunque, perché un comando che non si può premere
non deve rubare una fermata del Tab. Serve solo dove il pulsante **spiega**.

⚠️ **Una sola fonte del testo.** La spiegazione vive nella bolla di `app-hover-tooltip`, che
reagisce a mouse e a fuoco, e il pulsante ci punta con `aria-describedby`. Ripeterla in un
elemento nascosto la farebbe annunciare **due volte**.

⚠️ **Vale anche quando i comandi si raccolgono nel menu** su schermo stretto: lì l'hover non
c'è, e il motivo viaggia sul trigger — che per questo resta focusabile anche da spento.

### ⛔ 5.1 QUALI azioni compaiono non è deciso qui — rivisto il 20/08/2026

⚠️ **Qui c'erano due elenchi di pulsanti — `[ Anteprima ] [ Stampa ]` sul singolo,
`[ Stampa ] [ Esporta ]` sulla selezione multipla — e li dichiaravano comportamento
universale di ogni elenco.** Era una decisione presa troppo presto, e nel posto sbagliato.

> **La checkbox non serve a «selezionare per stampare»: crea uno STATO di selezione, sul
> quale agiscono funzioni diverse.** Quali funzioni siano ammesse dipende dalla pagina, dal
> tipo di record, dal suo stato, dai permessi e da quanti elementi sono selezionati.

Quindi non si costruisce «la funzione Stampa» o «la funzione Elimina»: si costruisce il
**contenitore** che domani può ospitarle correttamente. Le azioni concrete diventano
**candidate**, e la loro matrice si definisce elenco per elenco (parte E).

⛔ **Il componente condiviso non deve sapere che cosa significhino Stampa, Elimina,
Modifica, Anteprima o Esporta.** Riceve le azioni che la pagina dichiara e le rende.

### 5.2 Tre azioni indipendenti: Stampa · Excel · Esporta — corretto il 20/08/2026

```text
☐ 3 selezionati        [ Stampa ]  [ Excel ]  [ Esporta ▾ ]
```

⚠️ **Qui c'era `[ Stampa ] [ Esporta ▾ ]` con Excel DENTRO il menu, come se fosse un
formato.** Non lo è: in un gestionale «Excel» è una funzione propria dell'elenco — quella
che in Danea porta la vista corrente in un foglio — e trattarla come una variante di
Esporta la nasconde dietro un clic in più su un'azione frequente.

| Azione      | Che cosa fa                                                           |
| ----------- | --------------------------------------------------------------------- |
| **Stampa**  | produce la stampa degli elementi interessati                          |
| **Excel**   | porta l'elenco corrente in un vero foglio, colonne e dati della vista |
| **Esporta** | un'altra funzione, il cui contenuto si decide **pagina per pagina**   |

⛔ **Il contenuto di Esporta NON si decide qui.** Ogni modulo esporta cose diverse —
tracciati, formati, sottoinsiemi — e va censito prima di finire in un contratto comune.
Dove oggi CSV e PDF esistono restano, perché funzionano: non sono però il contratto di
tutti.

⚠️ **Excel non è un CSV rinominato**, e l'azione si mostra solo dove un foglio vero esiste.

⭐ **Il generatore però esiste già, e non è una libreria da aggiungere.**
`api/src/corrispettivi/corrispettivi-export.service.ts` produce un workbook **SpreadsheetML**
(`<?mso-application progid="Excel.Sheet"?>`), che Excel apre nativamente con intestazioni e
colonne — è l'«Excel» del Registro Corrispettivi. In `package.json` non c'è nessuna
dipendenza `xlsx`: è scritto in casa, ed è la base da estendere agli altri elenchi.

⚠️ **Se N elementi producano un unico fascicolo o N lavori separati non è deciso qui**: la
struttura regge entrambi, e la regola concreta si definisce quando si affronta la stampa
dei singoli tipi.

### ⭐ 5.3 L'ambito: la selezione ha la precedenza sui filtri

> **Nessuna riga selezionata → l'azione vale sull'intero risultato corrente dei filtri.
> Una o più righe selezionate → vale esclusivamente su quelle.**

```text
Filtro: agosto 2026 + Location Napoli · risultati 127

0 selezionati   → Stampa = 127 · Excel = 127 · Esporta = 127
4 selezionati   → Stampa = 4   · Excel = 4   · Esporta = 4
```

**Non serve decidere pagina per pagina** se l'export sia «del filtrato» o «del
selezionato»: sono entrambi supportati, e la selezione vince. È una regola trasversale
degli elenchi VestiFlow.

⛔ **`ListActionTarget` è un'unione discriminata, non un array che a volte è vuoto.** Con
`run(ids: string[])` il caso «tutto il filtrato» sarebbe un array vuoto, indistinguibile
da «non c'è niente da fare»: il primo handler scritto male esporterebbe zero righe invece
di centoventisette, e nessun tipo lo direbbe.

⚠️ **`'filtered'` non si serve dalle righe caricate, e questo è il costo vero della
regola.** Gli elenchi sono paginati **lato server**: ciò che il client ha in mano è una
pagina, non il risultato. Un handler che rispondesse con le righe in memoria darebbe le
prime venti di centoventisette **senza dirlo**. Deve passare da un export che conosce il
filtro — `BackgroundBlobExportService` esiste già ed è la strada. Va fatto per ogni pagina
che dichiara l'azione: la regola è semplice, l'implementazione non è gratis.

---

## 6. ⛔ RISCRITTA — sono TRE funzioni, e il nome della consultazione è «Dettaglio»

_Deciso dal proprietario il 20/08/2026. Prevale su tutto ciò che segue in questa sezione._

> **Modifica** = lavorare sul documento.
> **Dettaglio** = consultarlo rapidamente e in sicurezza.
> **Stampa/PDF** = produrne una rappresentazione destinata alla stampa/esportazione.

```text
clic sulla riga   →  Modifica
checkbox          →  Selezione
azione Dettaglio  →  vista read-only del documento
Stampa/PDF        →  funzione separata, da definire più avanti
```

⛔ **Qui sotto questa sezione diceva «Anteprima ≠ dettaglio», e cercava una vista NUOVA da
costruire dalla resa di stampa. Non è più così**, e la correzione va nella direzione opposta
a quella che il testo prendeva:

- **«Dettaglio» è il nome VestiFlow della vista di consultazione.** Non è un ripiego né
  una vecchia rotta da tollerare: è il termine che l'operatore legge già a schermo, nei
  titoli di pagina e in guida. Un secondo nome per la stessa cosa insegnerebbe una parola
  che poi non si ritrova da nessun'altra parte.
- **Il Dettaglio si mantiene**, ed è una scelta di prodotto: _«vale la pena, soprattutto
  per un gestionale destinato a negozi di abbigliamento»_.
- ⛔ **Stampa e Dettaglio non c'entrano niente l'uno con l'altro.** Che un documento si
  stampi non dice nulla su come lo si consulta, e viceversa. Erano legati solo dall'ipotesi,
  ora ritirata, di ricavare la consultazione dalla resa di stampa.

### ⚠️ La domanda che resta, ed è di verifica non di progetto

Il concetto esiste; **i componenti che lo implementano vanno giudicati uno per uno**:

> Gli attuali `DetailComponent` sono **buoni Dettagli**, oppure **vecchie copie read-only
> del form** — la maschera di modifica con i campi spenti?

Sono due cose diverse e si riconoscono: una consultazione raggruppa, gerarchizza e mostra
ciò che serve a **guardare**; un form spento ha una cella per campo, gli stessi controlli
della modifica con `disabled` sopra, e carica gli stessi dati che servivano a scrivere.

Il censimento tipo per tipo — chi ce l'ha, chi no, e quali sono buoni — è quello che
alimenta la matrice della parte E.

---

## 6-bis. _(testo originale, superato dalla sezione qui sopra)_

### Documento

È la maschera gestionale completa. Può mostrare, secondo il tipo: prodotto/descrizione,
SKU, variante, immagine/miniatura, quantità, prezzi, sconti, IVA, location, movimenti e
altri dati operativi.

### Anteprima

È una **rappresentazione di consultazione/stampa del documento**, non una seconda maschera
read-only che replica il form.

```text
Apri documento → modifica
Anteprima      → come viene rappresentato/stampato il documento
```

L'anteprima può diventare la base comune per anteprima a video, PDF e stampa.

Non è obbligatorio mostrare nell'anteprima tutti i dati operativi presenti nel form: per
esempio immagini e dettagli variante possono essere utili nella maschera e non nella stampa.

⚠️ **La DISTINZIONE qui sopra è decisa; l'AZIONE «Anteprima» no** _(rivisto il 20/08/2026)_.
Che l'anteprima non sia il dettaglio operativo resta fermo. Che compaia come pulsante della
barra contestuale su ogni elenco è una scelta di matrice, e sta fra le azioni candidate
della parte E — non in questa fetta.

---

## 7. ⛔ CORRETTA — il Dettaglio si tiene, ma va giudicato

_Rivista il 20/08/2026._ Questa sezione elencava fra gli esiti possibili la **rimozione** della
pagina, e chiudeva con «non mantenere una pagina "Dettaglio" solo per conservare una vecchia
rotta».

⭐ **Il concetto NON si rimuove**: è una decisione di prodotto (§6). Quello che va fatto è
l'altra metà della frase, ed è ancora giusta: **una pagina non è corretta solo perché esiste**.

Gli esiti possibili diventano quindi tre, e nessuno è «via»:

| Esito              | Quando                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **si tiene com'è** | è già una vista di consultazione: raggruppa, gerarchizza, mostra ciò che serve a guardare        |
| **si migliora**    | è una consultazione ma le manca qualcosa (documenti collegati, movimenti generati, chi e quando) |
| **si rifà**        | è la maschera di modifica con i campi spenti — un form travestito, non un Dettaglio              |

⚠️ La classificazione dei consumer resta comunque da fare: una rotta che nessuno raggiunge è un
altro problema, e si risolve dandole un ingresso (l'azione Dettaglio), non togliendola.

### 7-bis. _(testo originale)_

Le attuali pagine `DetailComponent` non vanno considerate automaticamente corrette solo
perché esistono. Prima di rimuoverle, classificare i consumer. Esiti possibili:

1. **riuso come vera Anteprima**, se il componente rappresenta già il documento stampabile;
2. **riduzione a wrapper** dell'anteprima/PDF, se contiene logica duplicata;
3. **rimozione**, se la funzione è coperta da anteprima/stampa e non ha consumer residui.

Non mantenere una pagina «Dettaglio» solo per conservare una vecchia rotta.

---

## 8. Stampa

La stampa deve partire dalla stessa rappresentazione canonica usata dall'anteprima.

```text
dati documento
→ modello/rappresentazione di stampa
   ├─ anteprima
   ├─ PDF
   └─ stampa
```

Evitare tre implementazioni indipendenti che possano divergere. La presenza di immagini,
SKU o varianti nella maschera non implica che debbano apparire nella stampa: il layout di
stampa va definito per tipo documento.

---

## 9. Desktop

- checkbox chiaramente separata dalla superficie cliccabile della riga;
- clic sulla riga = modifica immediata;
- selezione evidenziata senza trasformare la riga in un pulsante ambiguo;
- toolbar contestuale leggibile;
- anteprima/stampa raggiungibili senza entrare prima in modifica;
- nessun doppio clic necessario.

Le azioni non devono sottrarre spazio inutilmente alla tabella.

---

## 10. Mobile e touch

Il contratto resta identico:

```text
tap sul documento   → modifica
tap sulla checkbox  → selezione
```

Non usare doppio tap, hover o interazioni disponibili solo col mouse. Se lo spazio è
ridotto: la checkbox resta raggiungibile, le azioni contestuali possono essere raccolte in
un pannello/menu mobile, e selezione e apertura restano due gesti distinti. Non usare il
long-press come unico modo per selezionare.

---

## 11. Accessibilità e tastiera

La checkbox deve essere un controllo nativo/accessibile. La riga deve poter essere aperta
anche da tastiera secondo il pattern comune dell'elenco.

- focus visibile;
- `aria-label` specifiche per Anteprima/Stampa quando l'etichetta visiva non basta;
- la checkbox non deve attivare l'apertura della riga;
- le azioni disabilitate devono avere una ragione funzionale, non essere semplicemente
  nascoste se l'utente deve comprenderne l'indisponibilità.

---

## 12. Regola per Vendite al banco

```text
clic VN/RN sulla riga → apre Vendita al banco / Reso al banco in modifica
checkbox              → seleziona il documento
Anteprima             → visualizzazione/stampa separata
Stampa                → stampa del documento
```

La rotta di dettaglio non è più la destinazione primaria della riga. **C 3b è soddisfatto
solo quando la navigazione primaria porta all'edit.** L'azione `Elimina` resta fuori finché
`C 0` non viene completato lato dominio/API.

---

## 13. Pulizia del codice legacy

Il codice che non serve più va ripulito, **ma solo dopo aver classificato i consumer**. La
pulizia fa parte del lavoro, non è un'attività cosmetica successiva.

### 13.1 Da cercare

- route `detail` usate solo come destinazione primaria della riga;
- `rowOpenPath`, `documentOpenPath`, helper o config che puntano ancora al detail;
- componenti read-only che duplicano il form;
- azioni «Dettaglio» diventate semanticamente «Anteprima»;
- stili e test relativi al vecchio comportamento;
- commenti/documentazione che descrivono `click riga → dettaglio`;
- redirect e breadcrumb;
- eventuali generatori di PDF/stampa già riutilizzabili.

### 13.2 Da NON cancellare alla cieca

Generatori PDF, servizi di stampa, componenti che possono diventare l'anteprima canonica,
route ancora usate da link esterni/interni, contratti comuni usati da altri tipi documento.
Prima si verifica il consumer, poi si decide: riuso, migrazione o rimozione.

### 13.3 Risultato atteso

A migrazione completata non devono restare: due modi concorrenti per «aprire» lo stesso
documento; una pagina dettaglio duplicata senza funzione propria; route/helper morti; test
che proteggono il vecchio comportamento; commenti che raccontano una navigazione ormai falsa.

---

## 14. Architettura comune

La soluzione va implementata nel componente/lista documentale **comune** quando il
comportamento è trasversale. Non creare una variante hard-coded per Vendite al banco se lo
stesso contratto vale per tutti gli elenchi.

Sono invece specifici del tipo documento: quali azioni sono disponibili, quale rotta di
edit usare, quale anteprima/stampa usare, quali azioni massive sono consentite, permessi e
vincoli di dominio. La struttura comune deve poter esprimere questi comportamenti tramite
**configurazione tipizzata**.

---

## 15. Criteri di accettazione

**Apertura** — clic su una riga di documento modificabile apre l'edit; non serve doppio
clic; la checkbox non apre il documento; il comportamento è uguale con mouse e touch.

**Selezione** — una checkbox seleziona una riga; più checkbox consentono selezione
multipla; la checkbox di testata segue il contratto comune; cambiare filtri/paginazione non
produce una selezione invisibile o ingannevole.

**Anteprima e stampa** — un documento selezionato può essere mandato ad Anteprima senza
aprirlo in modifica; Anteprima e Stampa usano la stessa fonte quando possibile; l'anteprima
non è una copia read-only completa del form senza una funzione propria.

**Navigazione** — `row click → edit`; le vecchie route detail non restano destinazioni
primarie; redirect, breadcrumb e ritorno all'elenco sono coerenti; permessi e guardie non
vengono indeboliti.

**Pulizia** — nessun consumer morto; nessun helper/route/config obsoleto lasciato «per
sicurezza»; nessuna rimozione di codice condiviso senza averne verificato l'uso; test
aggiornati al nuovo contratto.

**Regressioni** — filtri, colonne, ricerca, paginazione ed export restano invariati; le
azioni di creazione restano invariate; nessun cambiamento ai movimenti, allo stock o ai
contratti economici; nessun cambiamento ai permessi backend.

---

## 16. Metodo di implementazione

Non serve un nuovo audit generale del repository. Ispezione **mirata** di: componente lista
documenti comune, configurazioni per tipo documento, route edit/detail, servizi di
anteprima/PDF/stampa, consumer effettivi dei DetailComponent, test di navigazione/selezione.

Poi classificare ogni elemento come `RIUSARE · MIGRARE · RINOMINARE · RIMUOVERE · FUORI
PERIMETRO`, e solo dopo intervenire. Se emerge una dipendenza trasversale reale, fermarsi su
quella specifica dipendenza; non trasformare la modifica in un audit generale.

---

## 17. Decisione sintetica

```text
RIGA DOCUMENTO
    clic → MODIFICA

CHECKBOX
    clic → SELEZIONE → ANTEPRIMA / STAMPA / AZIONI MASSIVE

ANTEPRIMA
    ≠ dettaglio operativo
    = rappresentazione di consultazione/stampa
```

Questa è la grammatica documentale da adottare in VestiFlow.

---

# B · ISPEZIONE MIRATA — misurata il 20/08/2026

Quanto segue non è la decisione: è ciò che il codice **faceva** quando la decisione è
arrivata, con la classificazione che il §16 chiede.

## B1. Il clic di riga oggi: sei rami, due soli alla modifica

`openDocument` in `document-list.component.ts` decide in sei rami:

```text
profilo purchase-invoice   → edit (annullate → dettaglio)     ✅ già conforme
profilo con rowOpensForm   → documentEditPath                 ✅ già conforme (2 profili su 7)
profilo SENZA rowOpensForm → /app/documents/<listPath>/:id    ⛔ dettaglio
famiglia arrivo merce      → /app/documents/:id/edit          ✅ già conforme
supplier_invoice           → registrazione-fattura/:id/edit   ✅ già conforme
tutto il resto             → /app/documents/:id               ⛔ dettaglio
```

`rowOpensForm: true` esiste su **2 profili su 7**: `quote` e `store-sale`.

## B2. `documentEditPath` ha già un indirizzo per ogni tipo — ma il fallback è una trappola

È la funzione che rende possibile il §2 senza inventare rotte: copre preventivo, DDT
vendita, i quattro tipi della famiglia vendita (via `SALES_FORM_ROUTE_SEGMENT`),
trasferimento, scarico manuale, rettifica, registrazione fattura, vendita e reso al banco.

⛔ **Il ramo finale, però, è `/app/documents/:id/edit`, che è la maschera dell'ARRIVO
MERCE** (`goods-receipt-form.component`). Oggi non fa danno perché ci arrivano solo i tipi
giusti; **mandarci ogni riga aprirebbe un arrivo merce su un inventario o su un ordine
online**. Il §2 non si implementa con «sempre `documentEditPath`».

## B3. I tipi che NON hanno una maschera documentale in `/app/documents`

| Tipo             | Dove vive la sua modifica   | Esito §2.1                         |
| ---------------- | --------------------------- | ---------------------------------- |
| `customer_order` | `/app/sales/:id/edit`       | modificabile, fuori da `documents` |
| `supplier_order` | `/app/orders/:id/edit`      | modificabile, fuori da `documents` |
| `inventory`      | `/app/inventory/counts/:id` | flusso proprio, nessun edit        |
| `online_sale`    | —                           | **read-only**: owner è Shopify     |
| `manual_receipt` | modulo Corrispettivi        | non è in `documents` (`10` §12)    |

## B4. La selezione esiste già, e manca solo il perimetro

`document-list.component.ts` ha già: `selectedIds`, `supportsSelection`, checkbox di
testata (`toggleAllSelection`), checkbox di riga con `$event.stopPropagation()`, potatura
della selezione al cambio dei documenti, ed export CSV, stampa elenco, PDF multipli ed
eliminazione massiva.

⛔ Ma `supportsSelection` è vera solo per gli elenchi Arrivi merce e per i profili con
`supportsBulkSelection: true` — che è **uno solo**, `quote`.

## B5. ⛔ RITIRATA — la conclusione era giusta, il bersaglio no

_Corretta il 20/08/2026._ Questa sezione concludeva che l'anteprima esisteva già sotto
forma di **«Anteprima stampa»**, e proponeva di **promuovere quella** al posto del dettaglio.

⛔ **Il bersaglio era sbagliato.** La vista di consultazione è il **Dettaglio**, e con la
stampa non c'entra: promuovere la resa di stampa avrebbe sostituito una consultazione con
un'immagine del foglio, che è un'altra funzione (vedi §6, riscritta).

⭐ **Quello che resta valido è il metodo**: non si costruisce ciò che esiste già.
Solo che ciò che esiste già è il Dettaglio, non l'anteprima di stampa.

_Testo originale sotto, conservato perché la misura che riporta è ancora vera._

### B5-bis

`DocumentPrintPreviewComponent` è montata su `/app/documents/:id/print`, e i due
`DetailComponent` la raggiungono con un pulsante **«Anteprima stampa»**.

> **È esattamente la «rappresentazione di consultazione/stampa» del §6.** Il lavoro non è
> crearla: è **promuoverla** a destinazione dell'azione Anteprima, al posto del dettaglio.

## B6. Classificazione, come chiede il §16

| Elemento                                          | Esito                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DocumentPrintPreviewComponent` + `:id/print`     | **RIUSARE** — è l'Anteprima canonica                                               |
| `documentEditPath`                                | **RIUSARE**, estendendolo ai tipi fuori da `documents`                             |
| `openDocument` (sei rami)                         | **MIGRARE** a una configurazione tipizzata per tipo                                |
| `documentOpenPath`                                | **MIGRARE**: deve dare la stessa risposta del clic di riga, o si aprono due strade |
| `rowOpensForm` sui profili                        | **RIMUOVERE** dopo la migrazione: se vale per tutti, non è più una configurazione  |
| selezione e azioni massive                        | **RIUSARE**, allargando il perimetro                                               |
| `DocumentDetailComponent` / `SalesDocumentDetail` | **da classificare per consumer** — §7, non in questo passaggio                     |
| unificazione stampa/PDF/anteprima (§8)            | **FUORI PERIMETRO** di questo passaggio: è un lavoro suo                           |

---

# C · PERIMETRO ESTESO — deciso il 20/08/2026

> **La selezione multipla non è una capacità dei soli elenchi documentali: è una capacità
> di OGNI elenco.** Ovunque ci sia una lista si deve poter selezionare più righe e fare
> un'azione massiva, foss'anche la sola esportazione.

**Il criterio è che l'esportazione di un sottoinsieme è un bisogno universale.** Un
operatore che vuole mandare al commercialista sei movimenti su duecento oggi esporta tutto
e taglia fuori dal gestionale. La selezione è ciò che rende quel taglio un'operazione del
gestionale.

⛔ **La regola del §2 — clic di riga = modifica — resta invece dei soli elenchi
documentali con una maschera.** Le due cose viaggiano insieme dove entrambe si applicano,
ma non sono la stessa decisione: giacenze e situazione non sono documenti e non hanno una
maschera da aprire.

## C0. Il perimetro COMPLETO — censito il 20/08/2026

⚠️ **La tabella C1 qui sotto era parziale.** Il censimento delle rotte ne ha aggiunti sette
e ha rivelato la cosa che cambia la dimensione del lavoro:

> ⭐ **Otto «pagine» diverse sono UN componente.** `DocumentListComponent` serve i profili
> `generic · goods-receipt · quote · proforma · sales-ddt · invoice · purchase-invoice ·
manual-unload`, più `store-sale` dalle rotte del banco.

| Indirizzo                          | Servito da                   | Contratto `14`               |
| ---------------------------------- | ---------------------------- | ---------------------------- |
| `/documents/arrivi-merce`          | `DocumentListComponent`      | ✅                           |
| `/documents/quote`                 | idem                         | ✅                           |
| `/documents/proforma`              | idem                         | ✅                           |
| `/documents/sales-ddt`             | idem                         | ✅                           |
| `/documents/fattura`               | idem                         | ✅                           |
| `/documents/registrazione-fattura` | idem                         | ✅                           |
| `/documents/registro`              | idem (`generic`)             | ✅                           |
| `/vendita-al-banco`                | idem (`store-sale`)          | ✅                           |
| `/orders`                          | `supplier-order-list`        | ✅                           |
| `/sales`                           | `sales-order-list`           | ✅                           |
| `/inventory/movements`             | `stock-movements`            | ✅                           |
| `/inventory` (giacenze)            | `inventory-levels`           | ⏸ **in pausa**               |
| `/inventory/situation`             | `inventory-situation`        | ⏸ **in pausa**               |
| `/sales/corrispettivi`             | `corrispettivi-report`       | ◐ barra sì, **selezione no** |
| **Trasferimenti**                  | ⛔ **nessun elenco proprio** | ❌                           |
| **Rettifiche di magazzino**        | ⛔ **nessun elenco proprio** | ❌                           |

⛔ **Trasferimenti e Rettifiche sono il buco vero.** Hanno `transfer/new`,
`transfer/:id/edit`, `adjustment/new`, `adjustment/:id/edit` — ma **nessuna pagina elenco**:
le loro card nell'hub puntano a `/app/documents/registro`, cioè al registro generico
filtrato. Non sono «da allineare»: sono da fare.

## C0.0 ⏸ Giacenze e Situazione sono in pausa — deciso il 20/08/2026

**Non perché siano difficili: perché hanno requisiti funzionali ancora da definire**, e
farli entrare adesso li farebbe entrare anche nel componente comune.

⛔ **Questi NON devono entrare nel refactor della struttura comune:**

- situazione/giacenza **a una data**;
- filtro **positivo / zero / negativo**;
- **valorizzazione** inventario;
- **totali inventariali**;
- eventuali azioni specifiche.

⭐ **Quando si riprendono, useranno il motore comune** — colonne, ordinamento,
ridimensionamento, barra strumenti, selezione dove prevista, ambito dell'export e struttura
tabellare. **Non si costruisce oggi un'infrastruttura specifica per loro.**

### Due misure da non perdere, fatte durante il censimento

⭐ **Giacenze ha già il percorso `filtered` che serve al contratto**:
`exportInventoryCsv` manda `locationId`, `search`, `stockStatus` **e le colonne visibili**, e
gira su `BackgroundBlobExportService`. Non è un CSV delle righe caricate — è l'export
filtrato lato server. **Non va duplicato**: quando Giacenze si riprende, quello diventa
l'handler del ramo `filtered`.

⚠️ **La Situazione diverge per FUNZIONE, non per debito.** La sua selezione è una
`Map<id, riga>` che sopravvive apposta al cambio pagina e filtri, perché compone le righe di
un ordine fornitore. È **l'opposto** della potatura della primitiva comune (§4.1), e
convergerla senza pensarci romperebbe il riordino **in silenzio**: nessun test lo copre, e il
difetto si vedrebbe solo in un ordine a cui mancano righe.

> **Quando si riprenderà, la strada preferita è che la primitiva impari un secondo modo** —
> una potatura dichiarata, non un ramo nascosto: serve a qualunque elenco che componga
> qualcosa attraversando più pagine.

## C0.1 ⛔ Le funzioni per singolo documento escono dal menu «···»

> **Il menu a tre puntini sulla riga non è il posto delle funzioni di un documento.**

Oggi la riga di un Arrivo merce apre un menu con _Apri/Modifica · Duplica · Stampa PDF ·
Etichette · Allegati · Elimina_, e la Registrazione fattura fornitore ha lo stesso
meccanismo. **Non regge**, per due ragioni che sono già nella grammatica decisa:

1. **Apri/Modifica non è una voce di menu**: è il clic sulla riga (§2). Metterla in un menu
   costa due gesti per l'azione più frequente.
2. **Le altre sono azioni sulla selezione** (§5): con un documento selezionato compaiono
   nella barra contestuale, **fisse e visibili**, non nascoste dietro tre puntini che
   l'operatore deve aprire per scoprire cosa c'è.

⚠️ **«Fisse» non vuol dire «tutte sempre»**: quali compaiono lo decide la matrice della
parte E, pagina per pagina. Vuol dire che non si scoprono aprendo un menu.

## C0.2 Arrivi merce: «ultimi 30 giorni» è un preset NUOVO

⚠️ Non è un ripristino. Misurato: i preset periodo sono `Mese corrente · Mese scorso · Anno
corrente · Anno scorso · Personalizzato`, e **«ultimi 30 giorni» non esiste**. Il default
degli Arrivi merce oggi è **Mese corrente** — motivo per cui il primo del mese l'elenco
sembra quasi vuoto.

Quindi servono due cose: **aggiungere il preset** a `MovementPeriodPreset` e **cambiarne il
default** per questo profilo.

## C1. Gli elenchi, e cosa hanno già — misurato il 20/08/2026

| Elenco                                        | Componente                     | Selezione | Export |
| --------------------------------------------- | ------------------------------ | --------- | ------ |
| **Documenti** (carico, vendita, DDT, fatture) | `document-list`                | parziale  | sì     |
| **Preventivi**                                | `document-list` (`quote`)      | sì        | sì     |
| **Vendite al banco**                          | `document-list` (`store-sale`) | no        | sì     |
| **Ordini cliente**                            | `sales-order-list`             | sì        | —      |
| **Ordini fornitore**                          | `supplier-order-list`          | no        | —      |
| **Movimenti**                                 | `stock-movements`              | no        | —      |
| **Giacenze**                                  | `inventory-levels`             | no        | sì     |
| **Situazione**                                | `inventory-situation`          | sì        | —      |
| **Corrispettivi**                             | `corrispettivi-orders-table`   | no        | sì     |

⚠️ **Nessuno dei tre elenchi di Magazzino ha la coppia completa**, e due su tre hanno metà
del meccanismo: la Situazione seleziona e non esporta la selezione, le Giacenze esportano
tutto e non selezionano.

## C2. Sui Corrispettivi la selezione serve a più cose

Anteprima, esportazioni, e le funzioni che arriveranno. È l'elenco dove il valore della
selezione non si esaurisce nell'export, ed è la ragione per cui il meccanismo va costruito
come **capacità comune**, non come un export in più su ciascuna pagina.

## C3. Ordine di esecuzione

```text
1. contratto documentale  — clic di riga e selezione su TUTTI i profili di document-list
2. ordini                 — cliente e fornitore
3. magazzino              — movimenti, giacenze, situazione
4. corrispettivi          — selezione, anteprima, export del sottoinsieme
```

⛔ **Non è un ordine di importanza: è un ordine di dipendenza.** Il passo 1 stabilisce il
contratto (che cosa emette una riga, come si dichiara la selezione, dove vive la barra
contestuale); i passi successivi lo riusano invece di reinventarne uno per pagina — che è
esattamente ciò che il §14 vieta.

## C4. Stato di esecuzione

### ✅ Passo 1 — contratto documentale, fatto il 20/08/2026

| Cosa                                                 | Dove                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| `DOCUMENT_ROW_OPENS` — Record esaustivo per tipo     | `document-routing.util.ts`                     |
| `documentRowPath` — l'unica risposta a «dove porta»  | idem; `documentOpenPath` ora vi delega         |
| `documentPreviewPath` — l'anteprima di consultazione | idem                                           |
| `openDocument`: da **sei rami** a una riga           | `document-list.component.ts`                   |
| selezione su **tutti** i profili (era 2 su 7)        | `supportsSelection` → sempre vera              |
| «Elimina» massivo con guardia di tipo                | `document-bulk-actions.util.ts` (+ prova)      |
| «Anteprima» con un solo documento selezionato        | barra contestuale → `/:id/print`               |
| `rowOpensForm` **rimosso**                           | non era più una configurazione: vale per tutti |

⚠️ **Due comportamenti sono cambiati oltre alla riga, e vanno saputi:**

1. **La ricerca globale apre la modifica**, come il clic di riga. Prima portava
   all'anteprima: due aperture diverse per lo stesso documento a seconda di dove lo si era
   trovato.
2. **Un documento ANNULLATO apre l'anteprima, per ogni tipo.** Era già così per le
   registrazioni fattura e per i profili «in stile Arrivi merce»; ora non dipende più
   dall'elenco da cui si è passati.

⛔ **`documentEditPath` aveva una trappola, ed è stata chiusa**: il suo ramo finale è la
maschera dell'**Arrivo merce**, e i due ordini (cliente e fornitore) ci sarebbero caduti
dentro perché le loro maschere vivono fuori da `/app/documents`. Ora hanno un ramo proprio,
e una prova inchioda che **nessun tipo dichiarato `'form'` finisca lì per sbaglio**.

⚠️ **Un'azione aggiunta e poi RITIRATA nello stesso giorno: «Anteprima».** Era stata messa
nella barra contestuale come comportamento universale. La revisione del §5.1 l'ha
riclassificata come **azione candidata**, e il pulsante è stato tolto: la fetta corrente
costruisce il contenitore, non le funzioni. La distinzione concettuale del §6 resta.

### ⏸️ Passi 2, 3 e 4 — da fare

Restano gli elenchi non documentali: ordini, magazzino, corrispettivi.

⚠️ **Prima di copiarci dentro la selezione**, va estratta la primitiva comune: il
meccanismo (stato selezionato, potatura al cambio dati, checkbox di testata, barra
contestuale) esiste **due volte** — `document-list` e `sales-order-list`, quasi identiche —
e **replicarlo altre cinque è esattamente ciò che il §14 vieta**, oltre a violare la soglia
di estrazione di `regole-architettura` («2 usi reali ⇒ estrazione obbligatoria»).

---

# D · L'INFRASTRUTTURA PRIMA DELLE FUNZIONI — deciso il 20/08/2026

> **Non si costruisce «la funzione Stampa» o «la funzione Elimina»: si costruisce il
> contenitore che domani può ospitarle correttamente.**

## D1. Che cosa sa la primitiva comune, e cosa non deve sapere

```text
SA                          selectedIds · count · toggle · selectVisible · clear · prune
                            quali azioni sono ammesse su 1 e quali su N
                            come si rendono: pulsante, menu, overflow

NON SA                      che cosa siano Stampa, Esporta, Elimina, Modifica, Anteprima
                            in quali formati si esporta
                            quali permessi servono
```

⛔ **Il giorno in cui il componente condiviso contiene un `if (azione === 'stampa')`, la
primitiva è morta**: da lì in poi ogni elenco nuovo la costringe a conoscere il proprio
dominio, ed è di nuovo un componente per pagina travestito da componente comune.

## D2. `selectionMode`: la checkbox non è obbligatoria ovunque

```text
'none'      nessuna checkbox — l'elenco non ha azioni sugli elementi
'single'    una riga per volta
'multiple'  selezione multipla
```

⚠️ **Configurabile per elenco, non globale.** Una checkbox in una tabella che non ha
nessuna azione da offrire è una colonna sprecata e una promessa non mantenuta.

## D3. Il contratto di un'azione

| Campo      | A che serve                                                    |
| ---------- | -------------------------------------------------------------- |
| `id`       | identità stabile, per test e telemetria                        |
| `label`    | che cosa legge l'operatore                                     |
| `icon`     | facoltativa                                                    |
| `supports` | `'single'` · `'multiple'` · `'any'` — su quante righe ha senso |
| `variant`  | l'aspetto del pulsante, dal design system                      |
| `items`    | sottovoci: la voce diventa un menu (i formati di Esporta)      |
| `run`      | l'handler, che riceve **gli ID selezionati**                   |
| `visible`  | la pagina decide, valutando tipo, stato e permessi             |
| `disabled` | disabilitata **con una ragione**, non nascosta (§11)           |
| `busy`     | l'azione in corso, per il caricamento sul pulsante             |

⛔ **L'handler riceve gli ID, non le righe del DOM.** È ciò che permette a una selezione di
sopravvivere a un riordino o a un aggiornamento dei dati, e che rende l'azione verificabile
senza rendere una tabella.

## D4. Perché si parte da Stampa ed Esporta

Sono **di sola lettura**: costruiscono e validano tutta l'infrastruttura senza toccare il
dominio. Se l'astrazione è sbagliata lo si scopre su un export, non su un'eliminazione.

## D5. Che cosa è stato costruito — 20/08/2026

| Pezzo                                      | Dove                                      |
| ------------------------------------------ | ----------------------------------------- |
| tipi: `SelectionMode`, `ListAction`, arità | `shared/models/list-selection.model.ts`   |
| stato: `createListSelection()`             | `shared/utils/list-selection.ts`          |
| barra contestuale (dumb)                   | `shared/components/selection-action-bar/` |
| menu con `disabled` e `busy`               | esteso `shared/components/action-menu/`   |

**Migrati due elenchi**, che è la prova che l'astrazione è trasversale e non un componente
per pagina travestito: **Documenti** e **Ordini cliente**. Erano due copie quasi identiche
dello stesso meccanismo — stesso `selectedIds`, stessa potatura, stessi cinque pulsanti.

⚠️ **`ListAction` è un'unione discriminata**: o `run`, o `items`. Dichiararle entrambe, o
nessuna, **non compila** — invece di produrre un pulsante che non fa niente.

⛔ **Un difetto trovato da una prova, non da un'ispezione**: un'azione disabilitata partiva
comunque. Il `<button disabled>` non emette clic in un browser, ma l'evento propaga se
qualcuno lo dispatcha, e il binding vive sull'host di `app-button` (che ha
`display: contents`). La guardia ora è nel componente: affidarsi al browser per non eseguire
un comando spento è una difesa che il primo test ha scavalcato.

### D5.1 Il layout: riferimento è il riepilogo Corrispettivi

> **UN riquadro chiaro con i fili dentro, non una banda a tinta piena.**

Le due barre massive che esistevano avevano **due look diversi**: tinta tenue col bordo
brand nei documenti, fondo `--color-primary` pieno con testo chiaro negli ordini. Nessuna
delle due era il vocabolario corrente. Ora la barra riusa quello del riepilogo
Corrispettivi (`regole-stile-ui` §5): superficie `--color-surface`, bordo `--color-border`,
`--radius-lg`, voci separate da un filo verticale, etichetta minuscola maiuscola con la
ricetta dell'intestazione tabella, valore un gradino sotto.

La densità è quella di una **barra strumenti**, non di controlli autonomi:
`--field-height: var(--control-h-button)` più `--button-font-size` e `--field-font-size` a
`--text-xs` — dichiarate entrambe, perché `app-button` legge la prima e il trigger di
`app-action-menu` la seconda.

### D5.2 ⛔ Nessuna barra fissa in basso su mobile

Gli Ordini cliente ne avevano una: sotto `lg` la barra diventava `position: fixed` ancorata
al fondo. **È il modo di Danea**, che tiene i comandi permanentemente in basso, e non è il
nostro — `regole-stile-ui` §5 dice «nessuna barra sticky in basso», e per il mobile che si
riduce il **numero** dei comandi, non che si inchiodano allo schermo.

Quella riduzione la barra la fa già: le varianti stanno in **un** menu nominato invece che
in tre pulsanti.

---

# E · MATRICE DELLE AZIONI — da definire, elenco per elenco

⛔ **Questa parte è deliberatamente vuota.** Le azioni qui sotto sono **candidate**: non
sono decise, e nessuna va implementata prima che la sua riga sia scritta.

| Azione      | Ammessa su | Note                                                           |
| ----------- | ---------- | -------------------------------------------------------------- |
| **Stampa**  | 1 · N      | ✅ in questa fetta                                             |
| **Esporta** | 1 · N      | ✅ in questa fetta, come menu di formati                       |
| Modifica    | 1          | «modifica massiva» è un'altra cosa e va decisa campo per campo |
| Anteprima   | 1          | ritirata dalla fetta corrente, vedi §5.1                       |
| Elimina     | 1 · N      | esiste già dove esisteva; non si estende senza decisione       |
| Duplica     | 1 · N?     | da decidere                                                    |

E poi, pagina per pagina: Preventivi, Ordini cliente, Ordini fornitore, Vendite al banco,
Movimenti, Giacenze, Situazione, Corrispettivi.

## E1. ⭐ L’anteprima ESISTE GIÀ, e non è la stampa _(chiarito dal proprietario, 20/08/2026)_

> **L’anteprima di un documento è il DETTAGLIO che alcuni tipi hanno già. Con la stampa non
> c’entra nulla.**

Non va progettata: va **raggiunta**. Riferimento indicato dal proprietario —
`/app/orders/:id` → `SupplierOrderDetailComponent`, titolo «Dettaglio ordine fornitore»,
protetto dai permessi di **sola visione** (`orders.routes.ts:39-45`).

Gli altri già esistenti: `document-detail`, `sales-document-detail`, e — fuori dai documenti —
`customer-detail`, `supplier-detail`, `product-detail`, `online-sale-detail`,
`inventory-count-detail`.

⛔ **Cade quindi l’ipotesi di costruire un’anteprima nuova dalla resa di stampa.** Era
un’alternativa che l’ispezione stava valutando; il proprietario l’ha chiusa. Stampa e
anteprima restano due cose separate, e il fatto che un documento si stampi non dice niente su
come lo si guarda.

### ✅ Il nome è deciso: **Dettaglio**

Questo documento diceva «anteprima»; l'applicazione dice **«Dettaglio»** — nei titoli di
pagina, nelle rotte, in guida. Il proprietario ha scelto **Dettaglio**, ed è la scelta giusta
per la ragione più semplice: è la parola che l'operatore legge già. Un secondo nome per la
stessa cosa insegnerebbe un termine che poi non si ritrova da nessun'altra parte.

⛔ **«Anteprima» esce dal vocabolario di questa specifica.** Dove compare ancora nel testo
originale delle parti A e B, va letta come **Dettaglio** — tranne dove parla della resa di
stampa, che è un'altra funzione ancora (§6).

## E2. ⏸ «Stampa» diventerà un menu per tipo documento — non adesso

Deciso il 20/08/2026, **rimandato esplicitamente**: «non ci soffermiamo ancora, abbiamo tante
cose da completare».

La forma indicata, sul modello di ciò che l’operatore già conosce:

```text
Stampa ▾   Documento
           Documenti selezionati (3)
           Elenco
```

⭐ **Sono tre azioni diverse sotto un nome solo**, ed è la ragione per cui il menu serve:

| Voce                          | Cosa stampa                                                           |
| ----------------------------- | --------------------------------------------------------------------- |
| **Documento**                 | il documento vero, impaginato                                         |
| **Documenti selezionati (N)** | N documenti, uno per pagina                                           |
| **Elenco**                    | la tabella filtrata — ⭐ **è l’unica che il pulsante Stampa fa oggi** |

⚠️ Il contenuto del menu **cambia col tipo documento**: non tutti i tipi hanno una stampa del
documento. La matrice dovrà dire quali.

⛔ **Fino ad allora il pulsante resta quello che è**, e continua a stampare l’elenco. Non si
aggiunge una voce che porta a una stampa che per quel tipo non esiste.

## E3. Sull’ambito: noi NON chiediamo, e resta così

Il gestionale che l’operatore conosce, davanti a un’azione massiva, apre un dialogo: «Su che
voci vuoi eseguire l’operazione? — Voci selezionate (2) · Voci visibili (24) · Annulla».

La nostra regola decide da sé (parte D): **0 selezionati → risultato filtrato; 1+ → solo la
selezione**. È una scelta già presa, e la differenza è voluta — un dialogo in più a ogni
stampa è un clic che si paga tutti i giorni per un’ambiguità che la selezione ha già sciolto.

⚠️ Va però nominata la differenza che resta: «voci visibili» e «risultato filtrato» non sono
la stessa cosa dove l’elenco è paginato o troncato. Da noi coincidono solo negli elenchi che
non paginano.

---

## E4. ⏸ Il Dettaglio: stato al 20/08/2026 — CONGELATO, non ridisegnato

**Decisione del proprietario**: il Dettaglio resta come funzione separata, accessibile dal suo
pulsante. **Non si ridisegna ora.** Qualità grafica, completezza della vista, uniformazione fra
documenti e rifacimento vero e proprio vanno in **seconda fase**.

⛔ Di questo censimento fa parte solo: chi ce l'ha, che rotte e componenti usa, che continui a
funzionare, e che **non venga rimosso o rotto** durante il lavoro sugli elenchi.

### Chi ce l'ha, e dove

| Tipo / profilo                                                              | Rotta                         | Componente                     |
| --------------------------------------------------------------------------- | ----------------------------- | ------------------------------ |
| Preventivo                                                                  | `documents/quote/:id`         | `SalesDocumentDetailComponent` |
| Proforma                                                                    | `documents/proforma/:id`      | idem                           |
| DDT vendita                                                                 | `documents/sales-ddt/:id`     | idem                           |
| Fattura                                                                     | `documents/fattura/:id`       | idem                           |
| Scarico manuale                                                             | `documents/manual-unload/:id` | idem                           |
| Vendita al banco                                                            | rotte del banco, `:id`        | idem                           |
| **tutto il resto** (Arrivo merce, Registrazione fattura, registro generico) | `documents/:id`               | `DocumentDetailComponent`      |
| Ordine fornitore                                                            | `orders/:id`                  | `SupplierOrderDetailComponent` |

I titoli di pagina dicono già **«Dettaglio …»** per tutti e otto: la parola è quella, e non va
cambiata.

⚠️ Esiste anche `documents/:id/print` — **il foglio di stampa**, che è un'altra funzione (§6) e
non va confusa con il Dettaglio.

### ✅ Il rischio è CHIUSO — 20/08/2026, sull'elenco documenti

Qui c'era: «`documentPreviewPath` ha **zero chiamanti** fuori dal proprio file. Dopo che il clic
di riga è passato alla Modifica, **nessun punto dell'interfaccia porta al Dettaglio**: ci si
arriva solo per URL diretto, o quando `documentRowPath` decide di mandarci un documento
annullato.»

⭐ **Il pulsante c'è**: azione `detail` nella barra dell'elenco documenti, `requires: 'one'`,
che copre gli **otto profili** di `DocumentListComponent`.

⚠️ **Restano senza porta gli altri due elenchi**: Ordini fornitore (`orders/:id` →
`SupplierOrderDetailComponent`, che §E1 indica come il riferimento della funzione) e Ordini
cliente. Le loro barre azioni hanno testate di forma diversa (§5.0.2) e vanno allineate
guardandole a schermo: è il passo successivo, non un residuo di questo.

⭐ **E «anteprima» è uscita anche dal codice**: `documentPreviewPath` si chiama ora
`documentDetailPath`, e `DOCUMENT_ROW_OPENS` dice `'form' | 'detail'`. §E1 aveva deciso il
vocabolario per il testo della specifica; lasciarlo diverso nel codice avrebbe insegnato la
parola sbagliata a chi legge i due nomi uno dopo l'altro.

⭐ Non è un difetto da correggere di straforo: è **esattamente il buco che il pulsante dedicato
chiude**, ed è la ragione per cui quell'azione entra in matrice per prima. Nel frattempo va
tenuto fermo un vincolo:

> **Il lavoro sugli elenchi non deve rimuovere né rompere queste otto rotte.** Una rotta senza
> ingresso sembra codice morto, e la reazione istintiva è cancellarla — sarebbe cancellare una
> funzione che il proprietario ha deciso di tenere.

## E5. ⭐ LA MATRICE — censita il 20/08/2026, da approvare

Vale per gli **otto profili** serviti da `DocumentListComponent`. Nessuna riga è implementata:
questa sezione è ciò che il proprietario approva o corregge.

⚠️ **Riletta sul modello a tre funzioni (§6).** Il censimento aveva chiamato «Anteprima» la
rotta `documents/:id/print`: quella è **il foglio di stampa**, quindi appartiene a Stampa/PDF.
Il **Dettaglio** è un'altra riga, e le sue rotte esistono già (§E4).

### Pronte — esistono e funzionano

| Azione                   | Arità   | API                                              | Note                                                                                                        |
| ------------------------ | ------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Stampa elenco**        | `none`* | nessuna: HTML client (`buildListPrintHtml`)      | ⚠️ `*` dichiarata `none` ma l'handler ignora il `target` e legge `selectedDocs()`: è `oneOrMore` travestita |
| **Stampa PDF documento** | `one`   | `GET /documents/:id/export/pdf`                  | su N documenti = N chiamate e N file. Il fascicolo unico non esiste                                         |
| **Dettaglio**            | `one`   | nessuna: navigazione, rotte già registrate (§E4) | ✅ **fatta il 20/08** sull'elenco documenti, otto profili. Ordini fornitore e cliente: da fare              |

### Da completare — l'endpoint c'è, manca un pezzo

| Azione                      | Arità        | Che cosa manca                                                                                |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| **Elimina**                 | `oneOrMore`* | ⛔ due difetti armati (D1, D2 sotto). `*` nessun endpoint bulk: N documenti = N `DELETE`      |
| **Esporta ▾** (CSV · PDF)   | `none`*      | ⛔ **due configurazioni di export per nove profili**: dalle Fatture esce `arrivi-merce-….csv` |
| **Annulla**                 | `one`        | endpoint **orfano**: lo chiama solo il dettaglio. Effetti collaterali i più larghi di tutte   |
| **Scarica XML** (FatturaPA) | `one`        | solo profilo `invoice`; oggi vive solo nel dettaglio                                          |
| **Duplica**                 | `one`        | ⛔ **no-op silenzioso** su `initial_load` e `inventory`                                       |

### Da costruire — non esiste il percorso

**Excel (.xls)** · **Stampa documenti (fascicolo)** · **Etichette** (oggi la voce naviga al
dettaglio invece di stampare) · **Genera fattura da DDT** (l'API sa convertire, il comando no) ·
**Segna come pagato**.

### Decisione aperta

**Allegati** e **Modifica** — la prima oggi è un Dettaglio travestito, la seconda duplicherebbe
il clic di riga. **Invia via email**: fuori perimetro.

### ⛔ Tre difetti ARMATI, già oggi

|        |                                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | «Elimina» è **accesa dove l'API risponde 403**. Sul profilo `generic` il gate guarda solo il TIPO, mai il permesso di famiglia della riga. Riproducibile col preset `clerk` di serie. ⚠️ Il menu «···» il controllo lo faceva già: la barra, costruita il 20/08, **ha saltato un presidio esistente** |
| **D2** | la barra «Elimina» **non guarda lo stato**, il menu di riga sì. Un DDT confermato accende il pulsante → **409**                                                                                                                                                                                       |
| **D3** | Ordini cliente: chi ha la sola `view` non ha checkbox, ma la barra resta visibile e dice «seleziona le righe» — **quando non c'è nulla da selezionare**. E le due azioni sono client-side: **il server le consentirebbe**                                                                             |

### ✅ DECISO — «Esporta» richiede `reports.export`, ovunque

_Deciso dal proprietario il 20/08/2026._

> **Se un permesso specifico di export esiste, non ha senso che l'export dei Corrispettivi lo
> rispetti e quello dei documenti no.** `Esporta` richiede `reports.export` in **tutti** gli
> elenchi in cui l'azione è disponibile.

⚠️ **Il permesso di export non sostituisce quello di vedere i dati**: restano due condizioni, e
devono restare coerenti. Chi non vede un elenco non lo esporta, e chi lo vede non lo esporta
automaticamente.

Oggi la politica è incoerente su cinque elenchi — Corrispettivi lo chiede sull'intera barra, i
documenti non chiedono nulla, gli Ordini fornitore non lo chiedono nemmeno sul loro export
server-side. È **un allineamento da fare**, non una scelta da discutere.

### ⏸ RIMANDATE al blocco «azioni massive» — censite, non decise

_Deciso il 20/08/2026: «per ora dobbiamo solo sapere quali azioni esistono, quali funzionano
davvero e quali mancano»._

⛔ **Non si fissano adesso**, e fissarle sarebbe aprire un tema intero mentre se ne sta
chiudendo un altro:

| Questione                                       | Stato                                   |
| ----------------------------------------------- | --------------------------------------- |
| selezione **eterogenea**                        | ⏸ due politiche entrambe valide (sotto) |
| **esiti parziali**                              | ⏸                                       |
| target «**tutto il filtrato**»                  | ⏸                                       |
| export su **selezione contro filtrato**         | ⏸                                       |
| comportamento delle azioni su **stati diversi** | ⏸                                       |

⭐ **Sulla selezione eterogenea il «tutto-o-niente» era una proposta, non una necessità**, e
l'alternativa del proprietario è altrettanto valida — per un gestionale forse più comoda:

```text
selezioni 5 documenti · 3 eliminabili, 2 no
  → il sistema lo dice CHIARAMENTE prima di procedere
  → elimina i 3 compatibili, lascia gli altri 2 invariati
  → restituisce un riepilogo preciso del risultato
```

> **Il vincolo che vale comunque, quale che sia la politica scelta: non deve essere silenzioso,
> e non deve dare l'impressione che l'azione valga su tutti quando ne processa solo alcuni.**

⚠️ È esattamente ciò che oggi succede su «Elimina», ed è la ragione per cui la questione va
chiusa **prima** di estendere le azioni massive: il comando prosegue dopo l'errore e riassume in
«N documenti non sono stati eliminati» — il risultato della seconda politica, ottenuto senza
averla scelta.

### ⛔ «Annulla» non è un esempio generico: è una funzione reale, e va nominata per quello che è

_Verificato il 20/08/2026, su richiesta del proprietario._

|                      |                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Esiste?**          | ✅ sì: `POST /documents/:id/cancel` (`documents.controller.ts:458` → `documents.service.ts:2573-2604`)                                                                                              |
| **È raggiungibile?** | ⚠️ **endpoint orfano**: l'unico chiamante nel frontend è il **dettaglio** (`document-detail.component.ts:701`). Da un elenco non si raggiunge                                                       |
| **Per quali tipi**   | generic · goods-receipt · quote · proforma · sales-ddt · invoice · purchase-invoice. ⛔ **FUORI**: scarico manuale (409, «si elimina, non si annulla») e vendita al banco (409, «registra un Reso») |
| **In quali stati**   | qualunque **tranne** già annullato (409). Vietata se il documento è collegato (`linkStatus === 'linked'`)                                                                                           |
| **Permesso**         | `manage` della famiglia + sede scrivibile. **Non esiste** un permesso `cancel` distinto                                                                                                             |

⚠️ **Ha gli effetti collaterali più larghi di tutta la matrice**, e non è «cambiare uno stato»:
riapre l'ordine fornitore, riapre e re-impegna gli ordini cliente manuali, **sgancia tutti gli
ordini cliente collegati**, ripristina i seriali, scrive una revisione.

⭐ **E una differenza operativa che nessun documento dichiara**: **annullare NON libera il numero**
— né l'indice unico né `lastAssignedNumber` filtrano sullo stato — mentre **eliminare sì**. È lo
scarto più grosso fra le due azioni, e va scritto in `docs/04` indipendentemente da questa matrice.

### Le tre famiglie, per il lavoro corrente

```text
Dettaglio                    →  azione sul SINGOLO documento
azioni operative specifiche  →  da censire e decidere caso per caso
azioni massive               →  comportamento da definire in una fase successiva
```

---

## E6. ⭐ Il Dettaglio sugli ALTRI TRE elenchi — censito il 20/08/2026

L'azione copre gli otto profili di `DocumentListComponent`. Restano tre elenchi che da lì non
passano, e **non sono lo stesso caso**: uno è pronto, uno non ha una destinazione, uno non ha
nemmeno il dato per costruirla.

| Elenco               | La destinazione esiste?                                                                               | Che cosa manca davvero        |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Ordine fornitore** | ✅ `orders/:id` → `SupplierOrderDetailComponent`, titolo «Dettaglio ordine fornitore», gated in VISTA | **solo il pulsante**          |
| **Ordine cliente**   | ⛔ **non esiste più**                                                                                 | una decisione, non del codice |
| **Corrispettivi**    | ⛔ la riga non sa a quale documento appartiene                                                        | un campo nel payload dell'API |

### ⛔ L'Ordine cliente non ha un Dettaglio, e non è una dimenticanza

Misurato in `sales-orders.routes.ts`: **`:id` e `:id/edit` caricano entrambi
`CustomerOrderFormComponent`**, e il commento della rotta lo dichiara — _«Sostituisce la
vecchia schermata Dettaglio: ogni ordine si apre nel form (bloccato)»_. Chi ha la sola vista
apre il form gated; lo sblocco è dentro.

⚠️ **Qui due decisioni di questo stesso documento divergono**, e va deciso quale vale:

| Dice                                                                                               | Dove   |
| -------------------------------------------------------------------------------------------------- | ------ |
| il Dettaglio **si mantiene**, è una funzione di prodotto e ha il suo pulsante                      | §6, §7 |
| il form bloccato **sostituisce** il Dettaglio, ed è «la direzione giusta anche per gli altri tipi» | §7     |

⛔ **Un pulsante «Dettaglio» che apre il form bloccato non è una scorciatoia: è un secondo nome
per la Modifica** — cioè esattamente ciò che §6 vieta. Finché la divergenza non è sciolta,
l'azione su Ordini cliente **non si dichiara**: un comando che non ha dove andare è peggio di un
comando assente.

### ⛔ Sui Corrispettivi manca il DATO, non il pulsante

`CorrispettiviRegisterRow` porta `salesOrderId` (l'ordine online) e `manualReceiptId` (la
registrazione manuale). **Non porta l'id del documento**: la riga «Vendita al banco» nasce da un
documento, e quel documento il client non sa qual è.

Oggi si apre **solo la registrazione manuale**, e solo a chi può correggerla
(`isOpenable`): tutte le altre righe sono informative per costruzione.

⭐ **Quindi l'azione non è rinviata per prudenza: non è costruibile.** Serve prima che l'API
dica a quale documento appartiene la riga — ed è un lavoro suo, che tocca il contratto del
registro (`docs/10`), non la barra azioni.

---

# F · LA GRAMMATICA DI UNA PAGINA ELENCO — misurata il 20/08/2026

Scritta **prima** di toccare Ordini fornitore, per non inventare ciò che esiste già. Vale
come lista di controllo anche per Movimenti, Giacenze e Situazione.

## F1. ⚠️ I Corrispettivi NON sono il riferimento dello scheletro

> **La grammatica di pagina è già codificata in `src/styles/_list-page.scss`** — 311 righe,
> usate da **19 fogli** — e il Registro Corrispettivi **non la usa**.

Il suo commento lo dichiara: _«`list-page-mobile-filters` è la parte che serve anche a chi —
come questo Registro — ha un layout proprio e **non vuole l'intero impianto delle
pagine-registro**»_. Prende i soli filtri mobili.

⛔ **Prenderne lo scheletro come canone sarebbe quindi sbagliato**, e porterebbe una pagina
allineata fuori dal canone invece che dentro. La distinzione è netta:

| Da `_list-page.scss` / `_responsive-table.scss` | Dai Corrispettivi                            |
| ----------------------------------------------- | -------------------------------------------- |
| testata, titolo + conteggio, sottotitolo        | **densità** dei controlli in barra strumenti |
| barra strumenti a card, ricerca, filtri in riga | il **riepilogo** di fondo pagina (§5)        |
| «Filtri (n)» e pannello mobile                  | la **card di un elenco/report** (§6)         |
| tabella desktop, sticky header, card su mobile  | —                                            |

## F2. Dove vive ogni pezzo

| Pezzo                         | Casa                                                   |
| ----------------------------- | ------------------------------------------------------ |
| scheletro di pagina           | `styles/_list-page.scss` — `@include lp.list-page($b)` |
| tabella e ripiego a card      | `styles/_responsive-table.scss`                        |
| selezione e barra contestuale | `shared/components/selection-action-bar/`              |
| stampa elenco e CSV           | `shared/utils/list-export.util.ts`                     |
| Excel                         | `api/src/common/spreadsheet.util.ts`                   |
| densità barra strumenti       | `--control-h-button` + `--button-font-size: --text-xs` |
| densità riga filtri           | `--control-h-field` + `--field-font-size: --text-xs`   |

## F3. Chi è già allineato — misurato

| Tabella                      | mixin `responsive-table` |                                         |
| ---------------------------- | ------------------------ | --------------------------------------- |
| `document-table`             | 3 + titolo mobile        | ✅                                      |
| `supplier-order-table`       | 3 + titolo mobile        | ✅                                      |
| `movement-table`             | 3                        | ✅                                      |
| `inventory-level-table`      | 3                        | ✅                                      |
| `situation-table`            | 3                        | ✅                                      |
| `sales-order-table`          | **2**                    | ⛔ manca `data-table-mobile-cards`      |
| `corrispettivi-orders-table` | **0**                    | ⚠️ card propria, **per decisione** (§6) |

⭐ **Ordini fornitore è già dentro il canone**: il suo foglio è di **tre righe**
(`@include lp.list-page('po-list')`) e il markup porta già `__header`, `__title-row`,
`__toolbar--card`, `__toolbar-main`, `__search`, `__filters--inline`, `__field`,
`__mobile-filters`. **Non c'è nessun vestito da inventare**: manca solo la funzione —
checkbox, clic di riga, azioni.

## F4. Due cose trovate, che non sono di questo lavoro

⛔ **`sales-order-table` non diventa card su mobile**: ha `data-table-desktop` ma non
`data-table-mobile-cards`. `regole-gestionale` chiede il fallback mobile per le tabelle
critiche, e l'elenco Ordini cliente è una di quelle. **Difetto aperto**, da chiudere quando
si tocca quella pagina.

⚠️ **`corrispettivi-orders-table` non usa nessun mixin, ed è corretto**: `regole-stile-ui`
§6 progetta la sua card apposta — tre fasce, «a sinistra le parole, a destra i numeri» —
perché il ripiego `data-label` di una tabella documentale, applicato a un registro da otto
colonne, darebbe otto righe tutte dello stesso peso. Non è una divergenza da sanare.

---

## F5. ⭐ Il Registro Corrispettivi è il RIFERIMENTO DI PARTENZA della grammatica comune

_Deciso dal proprietario il 20/08/2026._

> **La schermata attuale del Registro è il riferimento grafico di partenza per la grammatica
> comune dei riepiloghi desktop — non il disegno definitivo e intoccabile.** Il lavoro già
> fatto va preservato e promosso dove è trasversale; in seguito la grafica comune potrà essere
> migliorata **una volta sola per tutti**.

⛔ **Questo rovescia la domanda dell'assorbimento.** Non è «che cosa del Registro diverge dal
motore e va adattato»: è **«che cosa del Registro deve DIVENTARE il motore»**. Dove i due
divergono, l'ipotesi di partenza è che abbia ragione il Registro — è disegno pensato e
approvato, mentre i default del motore vengono da un mixin generico ereditato. Il peso della
prova sta su chi vuole tenere il default generico.

### Le tre famiglie in cui si classifica una regola

| Famiglia                 | Il criterio                                                                                                                                 | Dove finisce                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **comune da promuovere** | «un altro riepilogo la vorrebbe?» — densità del corpo, ritmo delle celle, fili, altezza dell'intestazione, comportamento del testo          | **default** del motore o del mixin: gli altri riepiloghi la ereditano      |
| **specifico**            | parla del **dominio**: il fondo della rettifica, l'accento per tipo, «Non determinata», la giornata come raggruppamento, la card progettata | resta alla feature — custom property, input per riga, contenuto proiettato |
| **legacy**               | ⚠️ serve la **prova**: la classe non è più nel template, o il mixin già dà quella regola                                                    | via                                                                        |

### ⛔ L'anti-pattern: la custom property che congela uno scarto

> **Non si conia una custom property per conservare una divergenza ACCIDENTALE.**

Se il Registro ha `--space-1` e il motore `--space-2` e la differenza non ha una ragione di
dominio, la risposta non è «una custom property che tiene i due valori»: è **sceglierne uno
solo e promuoverlo**.

⚠️ Una custom property nata per preservare uno scarto casuale **lo congela per sempre**, ed è
esattamente ciò che impedisce di «migliorare una volta sola per tutti». Nei due tentativi
falliti se ne stava coniando una decina, e ognuna avrebbe cementato una differenza che nessuno
aveva deciso.

⭐ Le custom property si riservano a ciò che è specifico **per ragione, non per storia**.

### Che cosa questo implica per chi esegue

- Promuovere una regola **cambia la resa di quattro schermate già in uso** — elenco documenti,
  ordini cliente, ordini fornitore, movimenti. Il cambiamento va **dichiarato a schermo**, non
  in astratto, e approvato prima.
- L'assorbimento del Registro non è più «adattare una tabella»: è **il primo passo della
  grammatica comune**. Ciò che si promuove ora è ciò che gli altri riepiloghi erediteranno.
- ⚠️ E vale la regola imparata dai due fallimenti: la verifica è **visiva**. Lint, build e test
  dicono che compila, non come si vede.

---

## G4. ⭐ Il comportamento della colonna stretta — deciso il 20/08/2026

Vale per **tutti i riepiloghi**.

> - le colonne restano **ridimensionabili per trascinamento**, col meccanismo condiviso già
>   esistente (`appTableColumnResize`);
> - quando una colonna viene ristretta, il contenuto **resta su una sola riga**;
> - il testo **non va a capo e non si spezza**;
> - il riferimento è **Danea**: restringendo, il contenuto viene **nascosto sul lato destro**;
> - ⛔ **per ora niente ellissi automatica**: si vuole il clipping del riferimento;
> - il contenuto **non deve riallargare la colonna** per mostrarsi tutto;
> - il selettore **Colonne** e le altre capacità comuni del motore restano;
> - l'ordinamento già definito **non si riapre** in questo passaggio.

### ⛔ `overflow-wrap: anywhere` è RITIRATO

Era la risposta attuale del Registro alla colonna stretta, ed era già registrata come **difetto
misurato** in `regole-stile-ui` §6 — «forza a spezzare le parole a metà: Rimbors-o,
Non-determinata». Ora è deciso: non è il comportamento voluto.

⚠️ Nella classificazione della grafica passa quindi da «non-determinato» a
**legacy-eliminabile**. Non va promosso, e va tolto dal Registro quando si migra.

### ⚠️ La conseguenza tecnica, e la decisione che apre

Il clipping si ottiene con tre cose insieme, e **la terza oggi non c'è**:

|                           |                                           |                             |
| ------------------------- | ----------------------------------------- | --------------------------- |
| `white-space: nowrap`     | il testo resta su una riga                | ✅ da aggiungere, banale    |
| `overflow: hidden`        | ciò che eccede si nasconde a destra       | ✅ da aggiungere, banale    |
| **`table-layout: fixed`** | il contenuto **non riallarga** la colonna | ⛔ **il motore usa `auto`** |

⛔ **Con `table-layout: auto` le prime due non bastano**: la larghezza «min-content» della cella
partecipa comunque al calcolo, e la colonna si allarga invece di tagliare. `regole-stile-ui` §6
prescriveva già `fixed` — è il motore che diverge.

> ⚠️ **Ma `table-layout: fixed` ha bisogno di una FONTE di larghezza, e oggi non esiste.**
> Misurato: **nessuna delle quattro configurazioni colonne dei riepiloghi** — corrispettivi,
> documenti, movimenti, ordini cliente — dichiara un solo `defaultWidthPx` o `minWidthPx`.

Senza una fonte, `fixed` divide lo spazio in **parti uguali**: la colonna Data larga quanto
Prodotto. È un cambiamento grosso su tutte e cinque le schermate.

⛔ **Questa è la decisione che serve, e non va inventata**: da dove vengono le larghezze
iniziali? Le tre strade, con quello che costano:

| Strada                                                                    | Costo                                                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **larghezze per colonna** (`defaultWidthPx` o `%`) dichiarate nel modello | va scritta una larghezza per ogni colonna di ogni riepilogo — è disegno, non meccanica  |
| **una larghezza sola** per tutte, con le sole eccezioni dichiarate        | meno da scrivere, ma la colonna Data resta larga quanto Prodotto finché non si eccettua |
| **`fixed` solo dopo il primo trascinamento**                              | ⛔ scartabile a vista: la tabella cambierebbe comportamento sotto le mani               |

### ⚠️ E `display: 'truncate'` va rivisto

Il modello colonne ha una vestizione `truncate` che tronca con **ellissi** e mette il testo
intero nel `title`. Con la decisione di oggi — clipping senza ellissi — le due cose si
contraddicono: `truncate` va rivisto o ritirato quando il clipping entra.

⚠️ Oggi è dichiarata su `counterparty` nell'elenco documenti. Non è ancora a schermo su nessun
riepilogo migrato, quindi il conflitto non è ancora visibile.

### ✅ CONFERMATO il 20/08/2026 — e la fonte delle larghezze

> - **`table-layout: fixed`**;
> - ogni colonna riceve una larghezza iniziale **dalla configurazione dello specifico
>   riepilogo**, non larghezze uguali automatiche;
> - le proporzioni iniziali vanno **ricavate dalle viste già progettate** e poi sottoposte a
>   **verifica visiva**;
> - il **resize manuale resta**;
> - restringendo: una riga sola, clipping a destra, niente wrap, niente spezzatura, niente ellissi;
> - ⛔ **non si introducono `min-width` non decisi**;
> - `display: 'truncate'` con ellissi **va ritirato se non ha altri consumer**.

### ⚠️ Misurato: UNA vista su cinque ha proporzioni progettate

Cercate nelle viste già disegnate, prima dell'assorbimento:

```text
ordini fornitore   ✅ sei colonne, somma 100%
                      Riferimento 14 · Fornitore 27 · Stato 19 · Righe 11 · Attesa 15 · Totale 14
elenco documenti   ⛔ nessuna larghezza per colonna
ordini cliente     ⛔ nessuna
movimenti          ⛔ nessuna
corrispettivi      ⛔ nessuna
```

⛔ **Per quattro riepiloghi su cinque non esistono proporzioni da ricavare.** Quelle schermate
non hanno mai avuto larghezze dichiarate: il loro aspetto attuale viene da `table-layout: auto`,
cioè **dal contenuto**, e cambia col contenuto — un nome lungo allarga la colonna, il giorno
dopo la restringe.

⭐ La conseguenza pratica, da dichiarare: «ricavare dalle viste già progettate» significa, per
quelle quattro, **misurare la resa corrente su dati rappresentativi** e fissarla come punto di
partenza. Non è un travaso: è la prima volta che quelle colonne ricevono una larghezza decisa.
Da qui la verifica visiva, che è la parte che stabilisce se le proporzioni sono giuste.

⚠️ Il modello degli ordini fornitore è l'unico riferimento vero, ed è utile anche come forma:
**percentuali che sommano a 100**, non pixel — una tabella di riepilogo occupa la larghezza
disponibile, e il pixel la lega alla finestra.

### ⚠️ `display: 'truncate'` — ha sei consumatori, e il ritiro è VINCOLATO

Misurato: è dichiarata su **sei** colonne «Controparte» (Cliente, Fornitore, Soggetto) nei
profili dell'elenco documenti. Ed è **live**: `document-table` è già sul motore, quindi oggi a
schermo quelle celle troncano **con l'ellissi**.

⛔ **Non si ritira prima del clipping.** Oggi `truncate` è l'unica cosa che contiene quella
colonna: toglierla mentre il motore è ancora su `table-layout: auto` la farebbe allargare col
contenuto. Il ritiro appartiene allo stesso passo che porta `fixed` + `nowrap` + `overflow`.

⚠️ E va detto che è un **cambiamento di comportamento sull'elenco documenti**: quella schermata
l'ellissi ce l'ha da prima dell'assorbimento (era `.doc-table__counterparty`). Passa al clipping
come tutti gli altri — è la nuova grammatica comune, ma va guardato.

### ⏸ Il pattern mobile è ereditabile — per ora

> **Per ora gli altri riepiloghi possono ereditare il pattern mobile dei Corrispettivi.**
> Vale **solo per i riepiloghi**, non per i documenti né per altre schermate.

⚠️ «Per ora» è la parola che conta: non apre la promozione dell'anatomia a componente
condiviso. Quella soglia resta quella di §F5 — il **secondo** riepilogo che la adotta davvero.

---

# H · IL MOTORE TABELLA COMUNE — contratto, 20/08/2026

Progettato con **cinque consumatori reali** già in mano, non nel vuoto: elenco documenti
(otto profili), Ordini cliente, Ordini fornitore, Movimenti, e i Corrispettivi come caso
**a sezioni**. Giacenze e Situazione restano sospese; Trasferimenti e Rettifiche vanno
costruiti ex novo e arrivano dopo.

## H1. ⛔ Prima di tutto: quanto si riduce DAVVERO

Il peso attuale delle cinque tabelle, misurato:

```text
corrispettivi-orders-table   1324 righe      sales-order-table    780
document-table                599             supplier-order-table 245
movement-table                268             ─────────────────────────
                                              totale              3216
```

⛔ **Non prometto che 3216 righe diventino 600, e sarebbe disonesto dirlo.** Dentro quel
numero ci sono tre cose diverse, e solo una sparisce:

| Che cos'è                                                            | Che fine fa                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| impalcatura: `thead`/`tbody`, contenitore, sticky, colonna selezione | **eliminata** — vive nel motore                                             |
| rendering di cella: pill, link, monospace, condizioni per tipo       | **rilocata** in template proiettati: le righe non spariscono, cambiano casa |
| card mobile su misura dei Corrispettivi                              | **intatta**                                                                 |

⚠️ **E la SCSS è già deduplicata dai mixin** (`_responsive-table.scss`): quello che resta
per tabella sono larghezze di colonna e tinte di cella, che restano. Il motore non toglie CSS.

> ⭐ **Il guadagno vero non è togliere righe: è non scrivere cinque volte l'ordinamento e
> il ridimensionamento**, che oggi non esistono e che `G` chiede per tutti i riepiloghi.
> Più `supplier-order-table`, che oggi ha **sei colonne fisse** e nessun selettore, e li
> riceve senza che si scriva plumbing per lei.

Se il criterio fosse il conteggio delle righe, questo lavoro non varrebbe la pena. Il
criterio è **quante volte scriveremo la stessa capacità**.

## H2. Il modello colonna — uno solo

Estende `TableColumnDef`, che **esiste già** e che il selettore colonne e le preferenze
usano: non si inventa un secondo modello (`G3`).

```text
id · label · headerTooltip · numeric        ← già esistenti
defaultVisible · pinnable · defaultWidthPx · minWidthPx
sortable?      false = intestazione non cliccabile
resizable?     false = nessuna maniglia
```

⚠️ **Qui c'era anche un campo `type` ('text' | 'number' | 'date' | 'money')**, giustificato
con «serve all'allineamento e al comparatore». **Non serve, e sarebbe speculativo:**

- ⚠️ **il comparatore ORA ESISTE** _(rivisto 20/08/2026)_: sta in
  `shared/utils/sort-values.util.ts` (`compareSortValues` · `SortValueKind`), promosso da
  `domain/documents/` quando il registro movimenti è diventato il suo secondo consumatore.
  La motivazione originale — «l’ordinamento lo fa il server» — **non vale più per gli elenchi
  che non paginano**: lì il client ha l’intero risultato del filtro, e ordina lui;
- l'**allineamento** lo dà già `numeric`, che tutte le colonne usano da sempre.

⛔ Aggiungerlo oggi vorrebbe dire due modi di dire la stessa cosa (`numeric` e
`type: 'number'`) e un campo che nessuno legge. Torna quando qualcosa lo consumerà davvero.

⚠️ **Ogni capacità è opt-out, non opt-in.** Una colonna nasce ordinabile e ridimensionabile:
se qualcosa non deve esserlo — la colonna azioni, la checkbox — lo dichiara.

## H3. Sezioni — e la riga piatta è il caso degenere

```text
sections: [
  { id, header?, rows, footer? }
]
```

⭐ **Una tabella piatta è UNA sezione senza intestazione e senza piede.** Non ci sono due
renderer del corpo da tenere sottili: ce n'è uno, con due `@if`.

| Pezzo     | Che cos'è                                                             | Chi lo usa    |
| --------- | --------------------------------------------------------------------- | ------------- |
| `header?` | un'etichetta a piena larghezza (`colspan` = colonne visibili)         | Corrispettivi |
| `rows`    | le righe                                                              | tutti         |
| `footer?` | `Record<columnId, string>` + etichetta che occupa le colonne iniziali | Corrispettivi |

⛔ **Il `colspan` non lo calcola la pagina.** Misurato sui Corrispettivi: oggi
`colonneTotali()` e `colonneDescrittive()` sono aritmetica scritta a mano, e dipendono
dall'ordine fisso delle colonne nel markup. Col modello comune diventano derivati —
quante colonne visibili, e qual è la prima che porta un totale.

⚠️ **I subtotali arrivano dai dati, non si ricalcolano**: `docs/10` lo vieta esplicitamente
per il Registro, e il motore non deve offrire una scorciatoia che lo permetta.

## H4. Ordinamento — lo stato sta nella PAGINA

⚠️ **Qui c’era «ricalca ciò che `product-table` già fa, che è l’unico ordinamento esistente
e funziona». Erano false entrambe** _(misurato 20/08/2026)_.

**Non era l’unico**: sei maschere documento ordinano le proprie righe da intestazione, con un
primitivo condiviso e testato. **E quello di `product-table` non funziona**: il client non
manda `sort`/`order` fra gli `HttpParams`, il DTO non li dichiara, e l'API impone
`orderBy: { updatedAt: desc }`. Cliccare gira la freccia, rifà la fetch e restituisce le
stesse righe nello stesso ordine — e già al primo caricamento l’intestazione annuncia
«Nome crescente» mentre i dati arrivano per data di modifica.

⛔ **È registrato come gap separato** (parte E), non corretto qui: quella schermata non è
oggetto di questo lavoro, e sistemare il ciclo di un comando che non ordina sarebbe lucidare
un controllo morto.

### ⭐ L’ordinamento è a PIÙ CHIAVI _(deciso 20/08/2026)_

> **Premere una seconda colonna non cancella la prima: la scavalca.** La nuova comanda, la
> precedente decide **a parità**.

È la convenzione di ogni gestionale, ed è ciò che rende utile ordinare per Prodotto e poi per
Data: dentro ogni prodotto le righe restano in ordine cronologico invece di disporsi a caso.
Con una chiave sola sarebbe un elenco che si riordina, non uno che si interroga.

```text
assente        →  in testa, crescente
crescente      →  in testa, decrescente
decrescente    →  esce, e le altre RESTANO
```

Premere una chiave **secondaria** la promuove in testa e la fa avanzare nel ciclo: un gesto
solo, invece di toglierla e rimetterla.

⚠️ **`aria-sort` lo porta la sola PRIMARIA.** ARIA ne raccomanda uno per volta, e dichiararne
tre direbbe a chi ascolta che la tabella è ordinata in tre modi contemporaneamente. Le chiavi
secondarie vivono nel **nome accessibile del pulsante** — «Quantità: ordinamento crescente,
chiave 2 di 3» — che è anche l’unico posto in cui la loro posizione è leggibile senza vedere.

⭐ **Il numero accanto alla freccia compare solo da due chiavi in su.** Con una sola, un «1»
perenne non informa di niente; con due o tre è l’unica cosa che dice quale comanda.

La forma resta questa:

```text
motore  →  aria-sort, indicatore, ciclo asc → desc → nessuno, emette sortChange
pagina  →  applica l'ordinamento all'intero risultato, lato server
```

⛔ **Il motore non ordina le righe.** Gli elenchi sono paginati lato server: ordinare le
righe caricate ordinerebbe **una pagina**, dando un risultato che sembra giusto e non lo è.

⚠️ **L'URL non è un requisito del motore.** Scriverci l'ordinamento è una scelta della
pagina — utile dove un elenco si condivide per collegamento, inutile altrove — e imporlo
renderebbe universale una decisione che non lo è. Il motore emette; la pagina decide dove
tenere lo stato.

⚠️ **Non si conserva** (`G1`): l'ordinamento è temporaneo, alla riapertura si torna al
predefinito.

⭐ **Le affordance compaiono solo se la pagina lega `sort`.** Un elenco la cui API non sa
ordinare non deve dichiarare `sortable: false` su ogni colonna: non lega l'input, e le
intestazioni restano quelle di prima. È il caso dei **Movimenti**, la cui query non ha un
campo d'ordinamento.

## H5. Ridimensionamento — la direttiva esiste, cambia solo chi la ascolta

`TableColumnResizeDirective` è già scritta e la usano le griglie di riga dei documenti.

|       | Griglia di riga documento                                     | Riepilogo                         |
| ----- | ------------------------------------------------------------- | --------------------------------- |
| modo  | `live`, a quote percentuali: allargare una restringe le altre | la colonna si allarga e basta     |
| stato | del documento                                                 | effimero, in memoria della pagina |

⛔ **Non si conserva** (`G1`), e **non si trascina la logica documentale**: è la stessa
direttiva, cambia chi decide cosa fare del numero che riporta.

## H6. Selezione — opzionale, e con due potature

`selectionMode: 'none' | 'single' | 'multiple'`, dalla primitiva già in uso.

⛔ **Una sola potatura, quella coerente col dataset visibile.**

⚠️ Qui c'era `pruneOnDataChange`, introdotto per la Situazione. **Non entra**: la Situazione
è **sospesa** proprio perché la sua semantica di selezione va decisa a parte, e un
consumatore in pausa non può aggiungere oggi una seconda modalità al motore comune — che
tutti gli altri porterebbero senza usarla.

Quando la Situazione si riprenderà si valuterà una politica esplicita, del tipo
`selectionPersistence: 'visibleDataset' | 'acrossPages'`. **Non prima che serva davvero.**

## H7. Visibilità e ordine colonne

Dal `TableColumnPreferenceService` e da `app-table-column-picker`, **che esistono**. Il
motore riceve `ResolvedTableColumn[]` già risolte e non conosce né preferenze né servizio.

⛔ Si conservano **preset e colonne visibili**; **non** larghezza e ordine (`G1`).

## H8. Rendering di cella — proiezione, non configurazione

```html
<app-data-table [columns]="…" [sections]="…">
  <ng-template appCell="status" let-row>
    <app-badge [tone]="tone(row)">{{ label(row) }}</app-badge>
  </ng-template>
</app-data-table>
```

⛔ **Non `cell: (row) => string`**: perderebbe pill, link, icone e monospace, cioè quasi
tutto ciò che quei `@switch` fanno oggi. Una direttiva `appCell` raccoglie i `TemplateRef`
per id di colonna; le colonne senza template rendono il testo.

⚠️ **È il pattern corretto, non l'antipattern dei flag.** `regole-architettura` mette in
guardia da «8+ `input()` con flag che alterano il template» — un template per colonna è
un'altra cosa, ed è ciò che usano le tabelle di PrimeNG e Material.

## H9. Barra azioni — resta fuori, e comunica per ID

Il motore emette la selezione; `app-list-actions-bar` la riceve dalla pagina. **Non si
annidano**: la barra sta nella testata (`§5.0.2`), la tabella nel corpo. Le azioni ricevono
un `ListActionTarget`, mai righe rese a schermo.

## H10. Mobile — fuori dal motore quando è specifico

```text
default      il ripiego a card dei mixin condivisi
specifico    template proiettato dalla pagina   → Corrispettivi, tre fasce
```

⚠️ Il motore rende la **struttura desktop** e delega la rappresentazione stretta. È ciò che
permette ai Corrispettivi di entrare nel motore **senza rinunciare** alla card progettata in
`regole-stile-ui` §6.

## H11. Mappa: che cosa sparisce, che cosa viene assorbito

| Oggi                                                                                                                                | Dopo                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `document-table` · `sales-order-table` · `supplier-order-table` · `movement-table` · `corrispettivi-orders-table`                   | **assorbite**: restano solo i template di cella nelle rispettive pagine |
| `app-selection-check` + mixin `selection-column`                                                                                    | **interni al motore**: smettono di essere API                           |
| `isAllSelected` / `isSomeSelected`                                                                                                  | interni al motore                                                       |
| cinque `@switch (col.id)`                                                                                                           | template `appCell` nelle pagine                                         |
| cinque impalcature `thead`/`tbody`                                                                                                  | **una**                                                                 |
| sorting: da scrivere 5 volte                                                                                                        | **una**                                                                 |
| resize: da collegare 5 volte                                                                                                        | **una**                                                                 |
| `app-table-column-picker` · `TableColumnPreferenceService` · `_responsive-table.scss` · `app-list-actions-bar` · `list-export.util` | **invariati**: già condivisi, il motore li usa                          |

⭐ **Due componenti condivisi spariscono dall'API pubblica** (`selection-check` e la colonna
selezione): è la risposta concreta al «vedo troppe componenti» — il motore _assorbe_, non si
aggiunge sopra.

⛔ **Il criterio di riuscita, e va verificato a fine migrazione:** se al termine esiste ancora
una tabella di riepilogo con un proprio `thead`/`tbody`, il motore è diventato un layer in
più. In quel caso si torna indietro, non si tiene entrambi.

## H12. ⭐ Primo consumer: **Movimenti** — misurato il 20/08/2026

Il motore esiste e ha un consumatore vero. Questa sezione non promette: **conta**.

### Che cosa è sparito davvero

`features/inventory/components/movement-table/` **non esiste più** — tre file, 223 righe
(31 `.ts` · 113 `.html` · 79 `.scss`). Non è stato svuotato né lasciato in parallelo:
nell’albero non c’è più un secondo `thead`/`tbody` dei movimenti, ed è il criterio di
riuscita dichiarato in H11.

### Che cosa il motore ha assorbito

| Assorbito                                                          | Prima stava                                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| impalcatura `thead`/`tbody`, `@for` con `track`                    | in ogni tabella                                                                         |
| colonna di selezione, «seleziona tutti» con lo stato indeterminato | in ogni tabella, con `allSelected`/`someSelected` ricalcolati                           |
| i quattro `@include` della grammatica condivisa                    | ripetuti identici in ogni foglio                                                        |
| **intestazione appiccicata e colonna bloccata**                    | riscritte per tabella, benché `pinned` fosse già nel modello colonne                    |
| **ordinamento e ridimensionamento**                                | ⚠️ nei Movimenti **non c’erano**: arrivano gratis il giorno in cui l’API saprà ordinare |

### Che cosa NON è stato assorbito, e per scelta

La pagina è cresciuta di **121 righe** (43 TS · 45 template · 33 SCSS) dove prima aveva
otto righe di `<app-movement-table>`. Sono:

- `cellText` — undici colonne di testo con i loro trattini di ripiego;
- cinque `ng-template appCell` — la pill del tipo e **quattro celle tipografiche**
  (codice in mono, data smorzata, descrizione troncata);
- tre regole SCSS che vestono quelle celle.

⭐ **La tipografia sta nella pagina per una ragione tecnica, non per gusto**: il contenuto
proiettato porta l’incapsulamento della pagina, quindi i suoi selettori lo raggiungono. È
l’unico modo di dare stile a una cella del motore **senza `::ng-deep`** — che
`regole-stile-ui` §5 vieta, e che nell’app non compare più in nessun punto.

⚠️ **Se un terzo riepilogo ripetesse «codice in mono» e «testo troncato», quella non è più
roba della pagina**: sono convenzioni d’app (`regole-stile-ui` §6, «SKU / EAN in
`--font-mono`»), e vanno promosse nel modello colonne. Il segnale da guardare è la terza
ripetizione, non la seconda.

### L’aritmetica onesta

```text
tolto dall’albero        −223 righe   (movement-table)
aggiunto alla pagina     +121 righe
il motore, pagato una volta   577 righe + 264 di prove
```

⛔ **Dopo UN consumatore il bilancio è in rosso, ed era previsto**: H1 lo diceva già —
il guadagno non è il conteggio di righe, è **non scrivere cinque volte l’ordinamento e il
ridimensionamento**. Il pareggio arriva al terzo o quarto riepilogo. Chi legge questa
sezione dopo il primo passo non deve concludere che il motore non conviene: deve concludere
che **non ha ancora finito**.

### Le quattro che restano

```text
corrispettivi-orders-table   1477 righe
sales-order-table             780
document-table                599   ← copre otto profili in una volta
supplier-order-table          245
```

⚠️ **Nei Movimenti l’ordinamento resta spento**, e non è una dimenticanza: la query dei
movimenti non ha un campo d’ordinamento. Accendere le intestazioni ordinerebbe **la pagina
caricata** invece del risultato — un risultato che sembra giusto e non lo è. Il motore
espone `sortable`; i Movimenti semplicemente non lo legano.

### Verificato

`npm run lint` pulito (dodici guardie) · `npm test` **226 file, 2015 prove** · l’e2e
riagganciato (`app-data-table`, `.data-table__row`) · nessuna modifica a dominio, API,
filtri, CSV o azioni.

---

## H13. ⭐ Movimenti senza pagine — eseguito il 20/08/2026

⛔ **La gerarchia decisionale, prima di tutto il resto.** Le decisioni funzionali più recenti
già confermate **prevalgono** su documenti precedenti, ispezioni del codice e comportamento
attuale. Una limitazione dell’implementazione **non riapre** un requisito già deciso: la si
dichiara come gap tecnico e si adegua il codice. Dove una riga di questa specifica risultava
incompatibile, è stata trattata come **documentazione da aggiornare**, non come vincolo.

### Le decisioni applicate

|                                     |                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **niente paginazione visibile**     | il registro non pagina più: `app-pagination` esce dai Movimenti (resta negli altri nove elenchi che lo usano)        |
| **ingresso delimitato**             | `DEFAULT_MOVEMENT_PERIOD` = **Ultimi 30 giorni**. Prima era «Tutti», cioè tutta la storia del tenant a ogni apertura |
| **«Tutti» resta**                   | come **voce esplicita** dell’elenco, non come predefinito                                                            |
| **ordinamento su tutte le colonne** | undici su undici, comprese le quattro che in SQL non si sarebbero potute ordinare                                    |
| **valori canonici**                 | mai la stampa in cella                                                                                               |

### ⭐ Perché il caricamento completo SEMPLIFICA l’ordinamento

Tolta la paginazione, l’insieme caricato **è** il risultato del filtro: ordinarlo nel client è
ordinare tutto, non una pagina. E questo rende ordinabili **allo stesso modo** anche le quattro
colonne che il database non sapeva ordinare —

```text
Codice articolo · Prodotto   richiedono una JOIN che l’include di Prisma non fa
Documento origine            è POLIMORFO: documents oppure online_sales, risolto dopo la query
Location                     nei trasferimenti è «Origine → Destinazione», composta nel client
```

— cioè il caso che avrebbe richiesto SQL grezzo con doppia LEFT JOIN e COALESCE. **Non serve
più**: la decisione di togliere le pagine ha dissolto il problema invece di aggirarlo.

⛔ E nessun endpoint del backend accetta oggi un parametro di ordinamento: la via server-side
non era «restare», era **costruire**.

### ⚠️ I tre modi in cui «ordina il testo che vedi» fallisce in silenzio

Sono misurati, e sono la ragione per cui il confronto pesca dai valori canonici
(`features/inventory/utils/movement-sort.util.ts`):

| Colonna      | Cosa sarebbe successo                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data**     | «17 ago 2026» ordinata come testo dà 1 dic · 10 apr · 17 ago · 2 gen — il giorno del mese, poi il nome del mese in alfabeto                                |
| **Quantità** | in cella il meno è **tipografico** (U+2212): `parseFloat` non lo legge, e **ogni scarico varrebbe zero**                                                   |
| **Tipo**     | la cella è una pill, il suo testo è vuoto: si confronterebbero stringhe vuote e **non succederebbe nulla** mentre l’intestazione dichiara «Tipo crescente» |

⭐ Il terzo è il peggiore perché **è muto**: nessuno segnala un comando che non fa niente, lo si
usa una volta e non lo si usa più.

### ⚠️ Due colonne si ordinano per ETICHETTA, ed è una decisione

**Tipo** e **Origine** portano in colonna un codice (`load`, `online_sale`) e mostrano una
parola tradotta («Carico», «Vendita online»). Si ordinano per la **parola**, non per il codice:
chi guarda un elenco alfabetico si aspetta l’ordine di ciò che legge, e per una categoria che
si presenta col proprio nome **il nome è il valore canonico**.

⛔ La conseguenza va detta invece che scoperta: qui l’ordine **non coincide** con quello che
darebbe il database. Stessa lettura per **Location**, che nei trasferimenti vale
«Origine → Destinazione» — il valore è la relazione fra due sedi, non una delle due.

### Il ciclo diverge fra elenchi e documenti, e la divergenza è DICHIARATA

```text
ELENCHI     asc → desc → nessuno      «nessuno» = l’ordine con cui l’API ha risposto
DOCUMENTI   asc ⇄ desc                un terzo stato non avrebbe destinazione
```

⛔ Nelle righe documento il riordino **riscrive il documento**: `applyLineSort()` svuota e
ripopola la `FormArray`, e al salvataggio la posizione si scrive dall’indice a schermo, finendo
nel documento salvato, nella stampa e nell’XML della fattura. **L’ordine di inserimento non è
registrato da nessuna parte** — misurato: in 5 documenti su 7 con più di due righe tutte le
righe portano lo stesso identico `created_at`. Quindi «nessuno = ripristina» è impossibile, e
dopo un trascinamento manuale la terza pressione **scarterebbe il lavoro appena fatto**.

### Un difetto muto trovato per strada, e corretto

⚠️ `articleCode` era selezionato nella query e poi **scartato** dalla destrutturazione
`{ variant, ...movement }`: la colonna «Codice articolo» mostrava `—` su **ogni** riga e
l’export ne esportava una vuota. Nessun test lo copriva, e un trattino si legge come «questo
movimento non ha codice», non come «il campo si è perso per strada». Era anche **prerequisito**
dell’ordinamento: senza, quella colonna avrebbe confrontato stringhe vuote — di nuovo in
silenzio.

### Ciò che NON è stato deciso

⏸️ **Nessun tetto.** Né 500, né 2.000, né altro. La resa di elenchi molto grandi è un tema
separato, da affrontare su **dati reali**: oggi tutti i tenant sono banchi di prova. L’evidenza
raccolta e la strada da valutare — **virtualizzazione delle righe**, non caricamento
progressivo — stanno in `docs/DA-FARE.md`.

---

---

## H14. ⭐ Assorbimento — tre tabelle su quattro, 20/08/2026

| Tabella                      | Esito                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `movement-table`             | ⛔ **eliminata** (§H12)                                                                 |
| `supplier-order-table`       | ⛔ **eliminata**: le colonne le dichiara la pagina, che non ha un selettore             |
| `document-table`             | ✅ **guscio**: 243 righe di template → 93, SCSS da 105 → 33. Copre gli **otto profili** |
| `sales-order-table`          | ✅ **guscio**: SCSS da 298 → 176. La vista mobile propria resta intatta                 |
| `corrispettivi-orders-table` | ⏸ **ferma, e non è un rinvio pigro** — vedi sotto                                       |

⭐ **«Guscio» non è un compromesso.** Il criterio di §H11 è che non resti una tabella con un
proprio `thead`/`tbody`: misurato, **document-table e sales-order-table ne hanno zero**. Le celle
di dominio restano dove appartengono invece di gonfiare la pagina, e lo scheletro è uno solo.

### Che cosa il motore ha guadagnato, e perché

Due estensioni, entrambe **tirate da un consumatore reale**, non anticipate:

| Estensione                                              | Chi l'ha chiesta                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`display: 'code' \| 'truncate'`** sul modello colonne | ⭐ la **terza** ripetizione delle stesse due ricette tipografiche. Il commento dei Movimenti diceva: «se un terzo riepilogo le ripete, salgono nel modello colonne». Ha ripetuto, e sono salite — otto template risparmiati sul solo elenco documenti |
| **`appRowActions`**, colonna comando in coda            | il menu «···» esiste ancora. ⏸ **Transitoria**: `14` §C0.1 ha deciso che ne escano le funzioni per singolo documento, ma toglierlo prima che la matrice le abbia ricollocate significherebbe togliere comandi senza casa                              |

⚠️ **`display` NON è il campo `type` che §H2 ha rifiutato.** Quello diceva **come confrontare** un
valore e serviva a un comparatore che allora non esisteva; questo dice **come si rende**. Una
colonna può essere `code` e ordinarsi come data.

### ⏸ Perché i Corrispettivi si fermano

⛔ **Non è una migrazione meccanica**, e trattarla come tale la romperebbe. Tre cose che il
motore non ha:

1. **Righe espandibili** — un `<tr>` con `colspan` sotto la riga, per il dettaglio. Il motore non
   ha il concetto, e aggiungerlo è una capacità nuova, non un adattamento.
2. **Una vista mobile INTERNA alla tabella** — una cella card per riga (`colspan` + `aria-hidden`),
   non un fratello come negli ordini cliente. Il ripiego a card del motore è un altro
   meccanismo: farli coesistere darebbe due viste della stessa riga.
3. **Il troncamento** «Mostra le altre N righe» — questo però è facile: alimenta le righe della
   sezione, e la sezione il motore ce l'ha.

✅ Il **piede di giornata** invece mappa esattamente su `DataTableSectionFooter`, che era stato
progettato per lui e non era mai stato esercitato.

⭐ **Il pezzo che decide è il punto 1.** Righe espandibili è una funzione che serve anche altrove
(un elenco documenti che mostri le righe senza aprire il documento): vale la pena farla, ma va
fatta come estensione dichiarata del motore, non di straforo dentro una migrazione.

---

### ⏸ Il motore porta due capacità che oggi non usa nessuno

`appRowCard` (con il suo blocco SCSS) e `rowClickableWhen` sono **nel codice e non
consumati**: erano state costruite per l'assorbimento dei Corrispettivi, che è stato
ripristinato. Sono committate perché il lavoro era stato scritto prima di spaccare i commit.

⚠️ **Restano perché servono davvero**, e servono a quel lavoro: quando i Corrispettivi si
riprenderanno, sono il meccanismo con cui la loro card mobile e la loro navigazione parziale
entrano nel motore senza essere riscritte. Toglierle e rifarle sarebbe fatica per due volte.

⛔ Ma il debito va nominato: **API condivisa senza consumatori e senza prove a schermo.** Se
i Corrispettivi non si riprendono, vanno tolte — `regole-qualita` dà trenta giorni al codice
morto, e questo è codice morto con una data di scadenza.

### ⛔ Un secondo difetto dello stesso assorbimento: la callback senza `this`

_Trovato il 20/08/2026, e non da un'ispezione: da un test che per la prima volta rendeva **una
riga vera**._

`document-table` passava al motore l'etichetta di riga **per nome** — `[rowLabel]="rowLabel"`,
dove `rowLabel` è un metodo di classe. Il motore la riceve come valore e la chiama così com'è
(`rowLabel()(row)`): il metodo arriva **senza `this`**, e la prima riga cliccabile che si
renderizza lancia `Cannot read properties of undefined (reading 'referenceLabel')`.

⛔ **Non è un difetto di accessibilità: è l'elenco documenti che non si apre** — tutti e otto i
profili, appena c'è un documento da mostrare.

|                                               |                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| introdotto da                                 | `5aa4a0ea`, l'assorbimento delle tre tabelle                              |
| quante callback erano sbagliate               | **una su cinque**: `rowId`, `cellText`, `selectionLabel` erano già frecce |
| gli altri tre consumatori (ordini, movimenti) | ✅ tutte frecce, nessuno colpito                                          |
| l'Ordine cliente                              | aveva già coniato `rowLabelFor` **per questa esatta ragione**             |

⚠️ **Nessuno dei quaranta test dell'elenco se n'era accorto**, e la causa è strutturale: rendono
tutti **zero righe**, dove la callback non viene mai invocata. Lint verde, build verde, 2037
test verdi, elenco giù.

⭐ **È la lezione di questa sezione un gradino più in basso.** Lì una CSS perdeva l'aggancio e
smetteva di agire in silenzio; qui una callback perde `this` e lancia — ma solo davanti a un
dato, che è precisamente ciò che i test non le mettevano davanti.

> **La guardia**: un test per elenco che renda **almeno una riga** e ne verifichi il nome
> accessibile. È il minimo che distingue «il componente si istanzia» da «l'elenco funziona».

### ⛔ Perché i Corrispettivi sono stati RIPRISTINATI

Il primo tentativo aveva spostato il markup nel motore lasciando **~600 righe di SCSS a
vestire classi `.corrispettivi-table__*` che il DOM non aveva più**. Build verde, 2037 test
verdi, e **tutta la grafica di quel riepilogo distrutta**.

⭐ **La lezione, che vale per ogni assorbimento futuro**: lint, build e test dicono che
compila e che il comportamento asserito regge — **non dicono niente su come si vede**. Una
CSS che perde l'aggancio resta valida e smette di agire: nessun errore, nessun test rosso.

Prima di spostare markup fra componenti si contano **le classi che perderanno l'aggancio**.
Se sono più di poche, non è un refactor meccanico: o gli stili si portano sul nuovo markup
**nello stesso passo**, o ci si ferma. E non si committa prima che qualcuno abbia guardato
la schermata.

## H15. ⭐ Ordinamento: non è stato PERSO, non era mai stato collegato — misurato il 20/08/2026

La domanda era: l'assorbimento ha tolto l'ordinamento agli altri riepiloghi, oppure non l'hanno
mai avuto? **Misurata, non dedotta.**

```text
chi accende [sortable] + [sort] + (sortChange) oggi
  movimenti          ✅ unico
  elenco documenti   ⛔        ordini cliente  ⛔
  ordini fornitore   ⛔        corrispettivi   ⛔

occorrenze di «sort» nei template PRIMA dell'assorbimento (5aa4a0ea^ / 430436c4^)
  document-table  0     sales-order-table  0     supplier-order-table  0
  movement-table  0     corrispettivi-table  0   ← mai toccata: è ancora lo stato storico
```

⭐ **Nessuna delle cinque aveva l'ordinamento da intestazione.** Il motore non l'ha tolto a
nessuno: l'ha **dato** ai Movimenti, che è la storia raccontata in §H13. L'unico ordinamento da
intestazione preesistente nell'app sta in `product-table`, che è una tabella propria e non passa
dal motore — coincide con la misura di §G3.

### ⛔ Perché non si accende «tanto il motore ce l'ha»

|                  | paginato lato server | ordinamento da intestazione                             |
| ---------------- | -------------------- | ------------------------------------------------------- |
| elenco documenti | ✅ `app-pagination`  | ordinerebbe **la pagina**, non il risultato             |
| ordini cliente   | ✅                   | idem                                                    |
| ordini fornitore | ✅                   | idem                                                    |
| movimenti        | ⛔ carica tutto      | ✅ per questo funziona, ed è coerente con §H13          |
| corrispettivi    | ⛔ carica il periodo | tecnicamente possibile lato client, da decidere a parte |

> **Su un elenco paginato, ordinare ciò che è a schermo è un ordinamento bugiardo**: mostra la
> prima pagina riordinata e la chiama «la più recente». Accenderlo lì richiede il supporto
> dell'API — è lavoro di contratto, non un `input` da mettere a `true`.

⚠️ Nessuna delle tre pagine paginate manda oggi un parametro di ordinamento all'API: verificato,
non esiste `sortBy` né equivalente nelle loro query.

---

## H16. ⛔ L'affordance di riga: tre cose perse nell'assorbimento — corrette il 20/08/2026

`data-table__row--clickable` esisteva nel template e **nessuna regola la leggeva**: una classe
orfana. Confrontando con `.doc-table__row`, la tabella documenti di prima:

| Prima (`doc-table`)                                | Dopo l'assorbimento                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cursor: pointer`                                  | ⛔ **perso**                                                                                              |
| `:hover` sulla riga                                | ⚠️ c'è, ma dal mixin condiviso: **su OGNI riga, cliccabile o no**                                         |
| `:focus-visible` con anello                        | ✅ lo dà la regola globale di `styles.scss`                                                               |
| `.doc-table__row--selected td` → riga scelta tinta | ⛔ **persa**: il mixin ha la regola per `tr.is-selected`, ma il motore quella classe non la applicava mai |

⭐ **La selezione era il difetto più grosso dei tre**, e nessuno lo vedeva perché la casella si
spunta comunque: si potevano scegliere sei righe senza che nessuna cambiasse aspetto.

### Che cosa è stato fatto, e dove

Nel foglio del **motore**, non nel mixin: quel mixin lo includono **diciotto** tabelle che il
concetto di «riga cliccabile» non hanno, e restringere là toglierebbe l'hover a tutte.

- `cursor: pointer` sulla sola riga cliccabile;
- l'hover del mixin annullato e **ridichiarato sul solo `--clickable`**;
- la tinta di selezione ridichiarata anche in hover, così la riga scelta resta riconoscibile
  mentre il puntatore ci passa;
- nel template, `is-selected` sulla riga: il gancio che mancava.

La guardia è nei test del motore: il CSS da lì non si asserisce, ma **la classe e il `tabindex`
sì** — e se sparissero, lo stile smetterebbe di agire in silenzio.

### ⚠️ Un effetto misurato che va guardato: i Movimenti perdono l'hover di riga

I Movimenti passano `[selectedIds]` ma **non** `[rowClickable]`: le loro righe non si aprono —
giustamente, un movimento non è un documento — quindi da oggi non si illuminano più al
passaggio del puntatore.

⛔ **È la regola applicata alla lettera** («una riga puramente informativa non deve sembrare
interattiva»), ma quelle righe una casella ce l'hanno: sono **selezionabili senza essere
apribili**, un terzo caso che la regola non nomina.

> **Domanda aperta al proprietario**: l'hover di riga deve seguire il _click_ (com'è ora) o
> l'_interattività_ — cioè anche la sola selezionabilità? È una riga di CSS, ma cambia la resa
> di una schermata in uso, e non va decisa di straforo.

---

# G · COLONNE DEI RIEPILOGHI — deciso il 20/08/2026

Vale per **tutti i riepiloghi**: documenti, prodotti, movimenti, giacenze, ordini.

## G1. Che cosa si conserva, e che cosa no

> **Si salva COSA si vede, non COME lo si vede.**

| Si conserva ✅                 | Non si conserva ⛔             |
| ------------------------------ | ------------------------------ |
| il **preset** della vista      | la **larghezza** delle colonne |
| le **colonne scelte visibili** | l'**ordine** delle colonne     |

**Il criterio è la durata dell'intenzione.** Decidere quali colonne servono è una
preferenza di lavoro: vale domani, e va con l'operatore da un dispositivo all'altro.
Allargare una colonna per leggere una descrizione lunga è un aggiustamento del momento:
ritrovarla allargata la settimana dopo è rumore, non memoria.

⚠️ **Non è una capacità nuova, è una capacità RIDOTTA.** `TableViewState` porta già
`columnWidths` e `columnOrder`, e `TableColumnPreferenceService` li salva in `localStorage`
**e sul server** su 28 viste. Larghezza e ordine escono da ciò che si persiste; visibilità
e preset restano dove sono.

⛔ **Il codice che li salvava non si lascia morto**: se `columnWidths` e `columnOrder` non
si persistono più, vanno tolti dallo stato salvato — non lasciati a viaggiare verso il
server per nessuno.

## G2. Il meccanismo esiste già, e viene dai documenti

`TableColumnResizeDirective` (`shared/directives/`) è la maniglia di ridimensionamento, e
**la usano già le griglie di riga dei documenti** — arrivo merce, vendita, trasferimento,
rettifica, ordine fornitore.

> **Il gesto è lo stesso; la logica no.**

|                            | Griglia di riga documento                                                  | Riepilogo                     |
| -------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| larghezze                  | a quote **percentuali**: allargare una colonna ne restringe altre (`live`) | la colonna si allarga e basta |
| a chi appartiene la logica | al documento                                                               | all'elenco                    |

⛔ **Non si trascina nei riepiloghi la logica documentale.** La direttiva è condivisa e
resta condivisa; ciò che cambia è chi decide cosa fare del numero che riporta.

## G3. Stato di partenza — misurato

| Capacità                          | Dove sta oggi                                                  |
| --------------------------------- | -------------------------------------------------------------- |
| maniglia di ridimensionamento     | ✅ direttiva condivisa, usata dalle **griglie di riga**        |
| riordino colonne                  | ✅ nel selettore colonne (`reorderable`, attivo di default)    |
| `columnWidths` applicate          | ⛔ **da nessun riepilogo**: modellate e salvate, mai collegate |
| ordinamento righe da intestazione | ⚠️ solo `product-table`                                        |
| Ordini fornitore                  | ⛔ nessuna colonna configurabile, nessun selettore             |

⚠️ **Questo è un lavoro suo**, e non entra nel passaggio che sta adottando la primitiva di
selezione: mescolare le due cose renderebbe impossibile attribuire un difetto all'una o
all'altra.
