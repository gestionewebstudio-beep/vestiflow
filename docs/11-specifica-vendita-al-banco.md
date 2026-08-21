# 11 · Vendita e Reso al banco — specifica funzionale

**Stato:** specifica corrente e **unica attiva** · aggiornata il 20/08/2026
**Modulo:** Vendita al banco · Reso al banco

> **Questo documento sostituisce integralmente la stesura precedente.** Non se ne recuperano
> decisioni funzionali: la cronologia git conserva lo storico, e questo file è l'unica fonte
> di ciò che VestiFlow deve fare. Si aggiorna **qui**, mano a mano che le decisioni si
> confermano; non nascono specifiche parallele.

## Come si legge — tre piani, tenuti separati

| Piano                           | Cos'è                                                     | Da dove viene                |
| ------------------------------- | --------------------------------------------------------- | ---------------------------- |
| **A · Decisioni funzionali**    | ciò che VestiFlow **deve** fare                           | il proprietario del progetto |
| **B · Comportamento osservato** | ciò che il codice **fa oggi**, verificato nel repository  | la misura, non il ricordo    |
| **C · Interventi conseguenti**  | ciò che va cambiato perché il codice si adegui al piano A | A confrontato con B          |

⚠️ **Un comportamento osservato non è un requisito.** Se il codice fa qualcosa che il piano A
non tratta, sta in B e va **sottoposto a decisione** — non promosso a regola perché esiste.

## ⏸️ Le decisioni aperte, in un posto solo

Elenco unico **perché due volte una domanda aperta è rimasta senza casa** e si è persa fra le
sezioni. Ogni voce vive dove è nata; qui ci sono i rimandi.

| Aperta                                        | Dove    |
| --------------------------------------------- | ------- |
| **riga manuale** senza articolo in anagrafica | **A21** |

⛔ **Nessuna di queste si chiude scrivendo codice che funziona.** Si chiudono decidendo, e
solo dopo si scrive. È la regola che questo documento ha già violato una volta.

---

# A · DECISIONI FUNZIONALI

## A1. Che cos'è

È la rappresentazione gestionale della **singola vendita fisica** conosciuta da VestiFlow. Il
modulo gestisce anche il **Reso al banco**.

```text
Cliente al banco
→ scansione o ricerca articoli
→ quantità / prezzo / sconto
→ eventuale cliente
→ pagamento come informazione interna
→ conclusione
→ scarico fisico
→ effetto economico e Corrispettivi interni
```

Non è il registratore telematico, non certifica da sola l'emissione del documento
commerciale, e deve funzionare **anche con cassa esterna separata**. Deve essere molto più
rapida di un normale documento, pur mantenendo la grammatica visiva di VestiFlow.

### ⚠️ Non esiste nessuna «futura Cassa VestiFlow»

**Deciso il 18/08/2026; la formulazione precedente è ritirata.** La Vendita al banco non è una
mini-cassa, non è provvisoria, non è la versione 1 di qualcos'altro, non è destinata a essere
sostituita.

In futuro potrà **agganciarsi** a una cassa o a un RT compatibile — inviare la vendita, o
riceverne informazioni — ma la vendita gestionale resta la stessa Vendita al banco.

**Conseguenza diretta sui Corrispettivi:** non nasce mai un'origine nuova.

```text
Vendita al banco non integrata   → Origine: Vendita al banco
Vendita al banco integrata a RT  → Origine: Vendita al banco
```

## A2. Navigazione: elenco → due pulsanti diretti → documento

**Deciso il 18/08/2026.** Si passa dall'elenco, come per tutti gli altri documenti, ma la
creazione ha **due pulsanti diretti**:

```text
Vendita al banco
  → elenco
    → [ Nuova vendita al banco ]   [ Nuovo reso al banco ]
      → documento
```

**I pulsanti nominano il tipo per esteso** _(deciso il 18/08)_. Troncarli a «Nuova vendita /
Nuovo reso» non porta nessun vantaggio reale, e va nella direzione opposta a quella presa:
stiamo **togliendo** la terminologia generica e legacy (**A6**), non aggiungendone.

⛔ **Non un pulsante «Nuovo» che apre un menu con Vendita e Reso.** Il motivo è operativo:
al banco un passaggio in meno è utile, e un menu da aprire più una voce da scegliere sono due
gesti dove ne basta uno. Vale su desktop e su mobile (vedi **A3**).

⚠️ **Qui c'era «Passare dall'elenco resta giusto», e il 20/08/2026 quella frase è stata
divisa in due.** Diceva: _«un ingresso diverso da tutti gli altri documenti costringerebbe
l'operatore a imparare due grammatiche per la stessa cosa»_. Vale ancora per l'**ingresso**;
non vale per la **scorciatoia**, che allora non esisteva.

### ⛔ La sidebar è la scorciatoia, l'hub Documenti è l'ingresso — deciso il 20/08/2026

> **La voce di sidebar «Nuova vendita al banco» apre direttamente la creazione. L'elenco vive
> in Documenti → Vendite al banco, e di lì i due pulsanti creano vendita e reso.**

```text
sidebar    → Nuova vendita al banco → documento                       ← SCORCIATOIA
Documenti  → Vendite al banco → elenco
                                 → [ Nuova vendita al banco ]
                                   [ Nuovo reso al banco ]  → documento  ← INGRESSO
```

**Il criterio è cosa fa l'operatore al banco.** Apre il gestionale per **vendere**: un elenco
in mezzo è un gesto in più a ogni cliente, e la sidebar è il posto dove quel gesto si toglie.
Consultare il registro è un'altra attività, più rara, e sta dove stanno tutti gli altri
registri.

⚠️ **La grammatica comune non è violata: è divisa in due.** L'ingresso al modulo resta quello
di ogni altro documento — Documenti → tipo → elenco → pulsanti — quindi chi cerca il registro
lo trova dove se lo aspetta. Ciò che il banco ha **in più** è una scorciatoia, perché è
l'unico tipo che si compila con un cliente davanti.

#### ⛔ Nell'hub Documenti la card è UNA — corretto il 20/08/2026

Erano **due**, affiancate nello stesso gruppo «Vendite», e portavano in due posti diversi:

```text
«Vendita al banco»   → /app/vendita-al-banco/nuova-vendita-al-banco   creazione
«Vendite al banco»   → /app/vendita-al-banco                          elenco
```

Due nomi che differiscono per **una lettera**. Resta la sola card verso l'elenco; la creazione
è ora la scorciatoia di sidebar.

⚠️ **I due permessi si separano, e così combaciano con le rotte che aprono:**

| Chi apre                      | Permesso                   | Perché                   |
| ----------------------------- | -------------------------- | ------------------------ |
| la **scorciatoia** di sidebar | `retail.register`          | è battere una vendita    |
| la **card** dell'hub          | `familyView('store_sale')` | è consultare un registro |

La card della creazione portava un `gate: 'retail-register'` che era **l'unico del suo tipo in
tutto l'hub**: tolta la card, il meccanismo restava senza nessuno che lo usasse, ed è stato
rimosso con lei — campo del tipo e ramo del filtro.

⚠️ **La voce di sidebar si illumina sulla sola creazione, non su tutto il modulo.** Col
prefisso largo «Nuova vendita al banco» risulterebbe accesa anche mentre si consulta l'elenco o
si corregge un reso: un'etichetta accesa che dice dove **non** sei. Ne discende che sull'elenco
non si illumina nessuna voce di sidebar — l'elenco appartiene a Documenti, che vive su un'altra
radice di indirizzo. È il compromesso scelto: meglio nessun segnale che un segnale falso.

**Creato il documento, non esiste un selettore** che permetta di trasformare una Vendita in
Reso o viceversa.

### Le rotte e i titoli — decisi il 18/08/2026

```text
/app/vendita-al-banco                          → elenco Vendite e Resi al banco
/app/vendita-al-banco/nuova-vendita-al-banco   → creazione Vendita al banco
/app/vendita-al-banco/nuovo-reso-al-banco      → creazione Reso al banco
```

E i titoli di pagina, coerenti con le rotte e coi pulsanti:

```text
Vendite al banco          ← menu e pagina elenco
Nuova vendita al banco    ← pulsante e titolo della creazione
Nuovo reso al banco       ← pulsante e titolo della creazione
```

### ⛔ «Vendite al banco» al plurale — deciso il 19/08/2026, sostituisce «Vendita al banco — elenco»

> **Il contenitore è plurale, la singola operazione è singolare.**

| Cosa                        | Come si chiama                                   |
| --------------------------- | ------------------------------------------------ |
| il **modulo**               | **Vendite al banco**                             |
| la **pagina elenco**        | **Vendite al banco**                             |
| la **card** in Documenti    | **Vendite al banco** — ed è una sola             |
| la **voce di sidebar**      | **Nuova vendita al banco** _(20/08, vedi sotto)_ |
| i **tipi documento**        | Vendita al banco · Reso al banco                 |
| i **pulsanti** di creazione | Nuova vendita al banco · Nuovo reso al banco     |

⚠️ **Cade «Vendita al banco — elenco»**, che era la formulazione del 18/08. Il plurale
distingue da solo il contenitore dalla singola operazione, e rende inutile il suffisso: un
titolo che deve spiegare cos'è con un trattino sta dicendo che il nome non basta.

⛔ **Non è una variante tollerata: è il nome.** La stringa vecchia vive oggi in cinque punti
(rotta elenco, config del profilo, card dell'hub, briciole, titolo di pagina) e vanno
allineati tutti nello stesso passaggio, o l'operatore legge due nomi per la stessa pagina.

### Il dialogo delle modifiche non salvate resta fra le due creazioni — deciso il 19/08/2026

> **`unsavedChangesGuard` sta su ENTRAMBE le rotte di creazione. Passando da Nuova vendita a
> Nuovo reso — o viceversa — con modifiche non salvate, il dialogo compare.**

Senza modifiche, la navigazione è normale. ⛔ **Nessun bypass fra le due rotte**: sarebbe
l'unica strada per uscire da un carrello aperto senza che nessuno lo chieda, e la si
scoprirebbe per caso.

⚠️ **È un cambio di comportamento, ed è voluto.** Oggi l'interruttore interno cambia modo
**senza nemmeno svuotare il carrello** — è la lagnanza che motiva **C4**. Due rotte distinte
ricreano il componente (`TabRouteReuseStrategy.shouldReuseRoute` confronta `routeConfig`), e
la guardia di uscita torna a fare il suo mestiere.

⚠️ **Il censimento delle rotte esistenti resta obbligatorio, ma serve ad altro.** Non a
decidere i nomi — quelli sono qui sopra — ma a **trovare tutti i consumatori** prima di
rinominare: link, redirect, voci di menu, permessi, guardie, test. La rinomina si fa dopo il
censimento, non al posto suo. ✅ **Eseguito il 19/08/2026**: otto piani, 198 ritrovamenti; le
trappole silenziose che ne sono uscite stanno in **C 3** qui sotto.

### Una vendita conclusa si riapre, si modifica e si elimina — deciso il 18/08/2026

> **Una Vendita al banco conclusa può essere riaperta, modificata, salvata nuovamente ed
> eliminata.**

⚠️ **La stesura precedente lasciava la domanda aperta**, e descriveva il blocco attuale come «un
comportamento che si osserva». Ora è deciso, e il blocco di oggi (**B2**, `FLOW_ONLY_DOCUMENT_TYPES`)
è **il divario da colmare**, non la regola.

**Le modifiche devono propagarsi a TUTTI gli effetti derivati del documento**: movimenti di
magazzino, Registro Corrispettivi, venduto, riepiloghi, report — e qualunque altra vista che
dipenda da quella vendita.

#### ⛔ La parte fondamentale: si aggiorna PER DIFFERENZA, non si accoda

> **La modifica non deve creare effetti aggiuntivi.** Non un secondo effetto sopra il
> precedente: il documento corrente è la verità, e gli effetti si portano a coincidere con esso.

```text
Vendita conclusa           2 × articolo A   →  movimento −2  ·  Corrispettivi 100 €

riapro e modifico          1 × articolo A   →  il movimento complessivo DEVE diventare −1
                                            →  Corrispettivi DEVE diventare 50 €

⛔ NON:  movimento −2, poi un secondo movimento +1 di rettifica
```

**È idempotente e per differenza.** Salvare due volte lo stesso contenuto non cambia niente;
salvare un contenuto diverso porta l'effetto al nuovo valore, non ne aggiunge un altro.

⚠️ **Non è una regola nuova di questo modulo.** È già scritta, ed è
`regole-gestionale.md` → «Un movimento per riga, aggiornato in posto — non uno per
salvataggio», con il vincolo che la fa rispettare: `@@unique([sourceDocumentType, sourceLineId])`.
Il criterio è **cosa è successo davvero**: correggere una vendita da 2 pezzi a 1 non significa
che ne siano usciti 2 e poi ne sia rientrato 1 — **è uscito un pezzo solo**, e il documento era
compilato male. ⛔ Far comparire movimenti di rettifica come effetto della modifica di un
documento è esplicitamente **vietato** da quella regola.

#### L'eliminazione — precisata il 18/08/2026

> **L'eliminazione di una Vendita al banco elimina o neutralizza INTEGRALMENTE gli effetti che
> quella vendita ha prodotto.**

```text
elimino una Vendita al banco conclusa
  → la merce scaricata torna in Giacenza per l'ESATTA quantità movimentata
  → la vendita non contribuisce più a Corrispettivi, venduto, report e riepiloghi
  → ogni altro effetto direttamente derivato viene riallineato
```

⛔ **Non si crea un secondo evento di «rettifica»** se il contratto comune VestiFlow per
l'eliminazione prevede la **rimozione o neutralizzazione dell'effetto originario**. È la stessa
disciplina della modifica: il registro dei movimenti racconta cosa è successo davvero, non la
storia dei salvataggi.

⚠️ **Quale delle due — rimozione o neutralizzazione — non si sceglie qui.** Si misura prima
**come gli altri documenti movimentanti la realizzano tecnicamente**, e si riusa il pattern
comune. ⛔ Nessuna logica locale della Vendita al banco.

#### ⛔ L'annullamento non esiste, per la Vendita al banco — deciso il 18/08/2026

> **Si elimina. Non si annulla.** Gli altri documenti hanno due strade — annullamento (il
> documento resta a storico, il numero resta occupato) ed eliminazione. La Vendita al banco ne
> ha **una sola**.

#### ⛔ Che cosa la modifica CONSERVA — deciso il 18/08/2026

⛔ **Non c'è niente da introdurre.** Serie e numerazione sono già quelle comuni di VestiFlow —
serie, lock del contatore, numero successivo, formattazione (**B5**). Il difetto è un altro:

```text
Vendita n. 125  →  la riapro  →  la modifico  →  salvo

ATTESO    resta n. 125
OGGI      il codice di creazione chiede un numero nuovo
```

**La regola è quindi una sola: in modifica si CONSERVA.** Quattro cose, e nessuna si rifà:

| Si conserva               | Perché                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **l'id delle righe**      | è ciò che consente di aggiornare il movimento collegato invece di duplicarlo                                                                            |
| **numero e serie**        | il riferimento è dentro la causale dei movimenti già scritti                                                                                            |
| **la data del documento** | vedi sotto                                                                                                                                              |
| **gli snapshot storici**  | ⛔ l'aliquota IVA della riga **non si rifotografa**: è il principio di **A11** — se il Codice IVA dell'articolo cambia, un documento di ieri non cambia |

#### La data: si fissa alla creazione, e non si muove più

> **La data di adesso vale solo alla CREAZIONE di un documento nuovo, e vale per tutti i tipi.**
> In modifica il documento resta alla propria data.

```text
Reso del 10 marzo  →  riapro ad agosto  →  modifico  →  salvo

ATTESO    resta del 10 marzo
```

⚠️ **Non è un dettaglio di comodo: è il Registro Corrispettivi.** Il Registro filtra e raggruppa
sulla data del documento. Una vendita di marzo corretta ad agosto che si spostasse ad agosto
uscirebbe dal Registro di marzo ed entrerebbe in quello di agosto — cioè cambierebbe **due**
periodi invece di correggerne uno.

#### Data e costo in modifica — deciso il 18/08/2026

⚠️ **Questa sezione diceva che il costo di una riga aggiunta si congela «al costo che l'articolo
aveva alla data del documento». Ritirato**: era un'interpretazione troppo larga della decisione,
e avrebbe richiesto **uno storico dei costi che VestiFlow non possiede** — il costo della
variante è un campo singolo che vale adesso, e l'unica storia esistente è il costo già congelato
sui movimenti.

**La decisione riguarda la data del documento e del movimento, non il costo.**

```text
Vendita del 10 marzo  →  la riapro ad agosto  →  aggiungo una riga nuova

Data documento      10 marzo
Data movimento      10 marzo
Costo riga nuova    il costo corrente disponibile nel momento in cui la riga si aggiunge,
                    e da lì congelato sul movimento
```

#### ⛔ Riga nuova e riga già esistente si comportano in modo DIVERSO, ed è la distinzione che conta

|                       | Costo                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| **riga aggiunta ora** | prende il **costo corrente**, e da quel momento è congelato                         |
| **riga già presente** | ⛔ **mantiene il costo già congelato sul movimento** — non prende il costo corrente |

⚠️ **Senza questa distinzione la correzione riscriverebbe il margine di una vendita vecchia**:
cambiare la quantità di una riga di marzo ne rivaluterebbe il costo a quello di agosto, e il
margine di quella vendita cambierebbe senza che nessuno abbia venduto niente di diverso.

⚠️ **Il totale di costo però si ricalcola**, perché la quantità è cambiata: si tiene il
**costo unitario** congelato e si rifà il **totale** su quella nuova — altrimenti una riga
portata da 2 a 1 continuerebbe a pesare per due.

⚠️ **È la regola già scritta** in `api/src/inventory/movement-cost.util.ts`, che è condivisa e ha
già tre chiamanti: _«il costo di una vendita è quello effettivo della variante nel momento in cui
la merce esce; congelandolo sul movimento, il margine di quella vendita non cambia più anche se
il costo della variante cambia dopo»_. Qui non si aggiunge una regola: si evita di violarla in
modifica.

#### ⛔ La modifica non si costruisce sul carrello attuale

La schermata di oggi tiene le righe in un array che **unisce due righe dello stesso articolo**:
`Maglia A × 1` più `Maglia A × 2` diventerebbero `Maglia A × 3`, e le due righe hanno identità
diverse — cioè due movimenti distinti, come impone `regole-gestionale.md`.

**Non è un ostacolo a questo lavoro**: la maschera va comunque ricostruita sull'Ordine cliente
(**A12**, Fase UI 3), che le righe con id le ha già. È un motivo in più per **non** appoggiare
la modifica alla schermata attuale.

#### ⛔ L'eliminazione NON cancella a cascata i documenti generati

⚠️ **Questa non è una regola della Vendita al banco: vale per TUTTI i documenti VestiFlow**, ed è
scritta nel contratto dei collegamenti — `docs/12`, sezione «L'eliminazione non è una cascata».
Qui resta solo la sua conseguenza per questo tipo.

```text
elimino una Vendita al banco che aveva generato una Fattura
  → la Fattura RESTA, con i propri effetti
  → si neutralizzano soltanto gli effetti PROPRI della vendita eliminata
```

⏸️ **E resta aperto un caso che nasce proprio da qui**, registrato in `docs/12`: quando il
documento successivo **non aveva prodotto l'effetto fisico** perché lo aveva già prodotto la
sorgente — che poi viene eliminata. La catena deve restare coerente, ma **come si rialloca quel
effetto non è deciso**, e non si decide di straforo dentro questo modulo.

#### ✅ Che il Registro Corrispettivi legga DAL VIVO non è un problema: è la condizione che rende tutto questo possibile

⚠️ **Correzione del 18/08 a una formulazione mia.** Avevo presentato la lettura dal vivo del
Registro — nessuna tabella derivata, nessuna copia congelata — come un rischio da governare
prima di aprire la modifica. **È il contrario:** se la vendita viene corretta, il Registro
**deve** aggiornarsi, e leggere dal vivo è esattamente ciò che lo fa accadere senza dover
riallineare una copia.

Il difetto sarebbe l'opposto — un Registro che conserva l'importo vecchio di una vendita
corretta.

#### ⛔ Prima di implementare: due censimenti, e nessuna logica locale

1. **Come gli altri documenti VestiFlow gestiscono modifica ed eliminazione dopo aver già
   prodotto movimenti.** Arrivo merce, DDT vendita, Trasferimento, Rettifica e Scarico manuale
   hanno ognuno un comportamento, e vanno confrontati prima di scriverne uno nuovo.
2. **La causa radice del comportamento attuale** — perché i due tipi stiano in
   `FLOW_ONLY_DOCUMENT_TYPES` e cosa comporti toglierli, o servirli altrimenti.

⛔ **Non si inventa una logica locale della Vendita al banco.** Il meccanismo di riconciliazione
per differenza esiste già nel dominio documenti; il lavoro è farlo valere anche qui, non
scriverne un secondo.

## A3. Vendita e Reso: due tasti separati alla creazione

**Deciso il 18/08/2026.** Nell'elenco ci sono **due tasti**, non un tasto «Nuovo» con un
selettore dentro:

```text
[ Nuova vendita al banco ]   [ Nuovo reso al banco ]
```

**Due tasti perché al banco un passaggio in meno conta**: un menu da aprire e una voce da
scegliere sono due gesti dove ne basta uno, e la fretta è la condizione normale di quella
schermata — non un caso limite. Vale **su desktop e su mobile**, con la stessa forma.

Scelto il tasto, la maschera è configurata per quel tipo. **Non** c'è un interruttore dentro
il documento che consenta di trasformare liberamente vendita → reso → vendita mentre si
compila.

**Il motivo è di dominio, non di ergonomia.** I due condividono l'impianto UI ma non il
comportamento:

|                      | effetto alla conclusione                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Vendita al banco** | scarico fisico · vendita economica positiva · pagamento                                                                         |
| **Reso al banco**    | **eventuale** rientro fisico, secondo la spunta di carico (**A11-ter**) · **rettifica** economica negativa · eventuale rimborso |

Una maschera che li scambia a metà compilazione nasconde questa differenza proprio dove
conta. Vedi **B4** per che cosa fa oggi l'interruttore esistente, e **A11** per il Reso.

## A4. Netto/ivato: la stessa logica di tutti gli altri documenti

**Deciso il 18/08/2026, dopo due formulazioni intermedie scartate** — prima «sempre ivati»,
poi una regola articolata con memoria e default propri. Entrambe sono ritirate.

Vendita e Reso al banco usano **il contratto comune** netto/ivato del gestionale. Nessuna
eccezione, nessun default dedicato, nessuna logica parallela, **nessun forcing «sempre
ivato»**.

- il selettore è quello **già previsto dagli altri documenti, nella testata della colonna
  Prezzo**;
- la modalità iniziale segue la regola generale: memoria dell'operatore per il tipo, poi
  convenzione aziendale;
- la modalità scelta resta persistita nel documento e resta modificabile.

⚠️ **Correzione del 18/08: qui c'era scritto «in testata», ed era sbagliato.** Il selettore vive
nella **testata della colonna Prezzo** — misurato, e c'è un test che lo dice per nome
(«permette lo switch costi netto/ivato dall'intestazione colonna»). Ne discende una
conseguenza pratica: **il netto/ivato è parte della costruzione della tabella righe**, non un
lavoro autonomo che si possa fare prima.

**Chi lavora al netto deve poter vedere e inserire netto.** Un grossista che vende al banco
non è un caso limite da normare a parte: è la ragione per cui non si scrive una regola
speciale.

⚠️ **Entrare nel contratto comune significa ereditarlo tutto**, non solo il selettore che fa
comodo. Se cambiare la convenzione aziendale azzera le memorie dei tipi che appartengono a
quel contratto, Vendita e Reso al banco si comportano allo stesso modo. Non è una regola nuova
per questo modulo: è la conseguenza di «la stessa logica degli altri».

## A5. Numerazione: quella comune, e nessuna sigla fissata qui

**Deciso il 18/08/2026.** Vendita e Reso al banco usano il **sistema di numerazione e prefissi
comune** agli altri documenti. Non si inventa una numerazione dedicata, e **questa specifica
non fissa nessuna sigla**.

⚠️ Fissarne una sarebbe scrivere una regola già condannata: `docs/04` §11 ha deciso di
**togliere sigla e zeri dal numero visibile di TUTTI i documenti**. Quando sarà eseguita, la
Vendita al banco deve cadere insieme agli altri, non restare indietro con una regola sua.

**Ma questo non è un motivo per anticipare quel lavoro qui** _(deciso il 18/08/2026)_: se
costruire la Vendita al banco **senza** sigla è più scomodo che costruirla con quella che il
sistema comune già le assegna, **si fa con la sigla**. Togliere le sigle è un lavoro
trasversale a tutti i documenti, e si fa come tale — non di straforo dentro un modulo, dove
produrrebbe un documento diverso da tutti gli altri per il tempo che passa in mezzo.

## A6. Terminologia: «Vendita negozio» è legacy

**Deciso il 18/08/2026.** «Vendita al banco» è l'**unica denominazione funzionale corrente**.
«Vendita negozio» e «Vendita in negozio» vanno censite e rimosse, non lasciate convivere.

Il censimento copre: interfaccia, menu, titoli, rotte, etichette, messaggi, causali dei
movimenti, stampe ed export, documentazione, test, e nomi tecnici di componenti, servizi e
metodi.

### ⛔ «Cassa» è del censimento, e la distinzione è tutta nel referente _(18/08/2026)_

⚠️ **La parola mancava da questo elenco**, e per questo è passata: si è trovata nel titolo della
schermata operativa, nella sua sottotestata («Cassa interna non fiscale»), in un'etichetta
accessibile e in tre commenti.

> **La nostra schermata NON è «la cassa»: è il documento di Vendita al banco.**

| Uso                                                             | Esito                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| «la cassa» = la **nostra** schermata, il modulo, il documento   | ⛔ **vietato**: si dice Vendita al banco                       |
| «cassa esterna» = l'**apparecchio fisico** del negozio, o un RT | ✅ **legittimo**: è un'altra cosa, e A10 ne parla proprio così |
| «la cassa ferma» = il **banco bloccato** davanti al cliente     | ✅ legittimo: descrive la situazione, non il software          |

⛔ **E non cambia col collegamento a una cassa esterna** _(confermato il 18/08)_: quando la
Vendita al banco potrà agganciarsi a un RT compatibile **resterà Vendita al banco** — è già la
decisione di **A1**, e la conseguenza sui Corrispettivi è che non nasce mai un'origine nuova.

⚠️ **Il documento non si definisce rispetto alla cassa.** La sottotestata diceva «Cassa interna
non fiscale: lo scontrino viene emesso sulla cassa esterna»: due volte la parola, e il documento
descritto per ciò che **non** è. Ora dice cosa fa — scarica giacenza e disponibilità, non tocca
l'impegnata — e che non è fiscale.

Ma **si classifica prima di rinominare**, perché i tre livelli hanno esiti diversi:

| Livello                                           | Esito                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **esposto all'operatore**                         | si rinomina in «Vendita al banco»                                                                                                    |
| **identificatore tecnico stabile o contrattuale** | **non** si rinomina per estetica: prima si valuta il rischio di migrazione e regressione                                             |
| **stringhe storiche già persistite**              | si censiscono prima di scegliere fra correggere la rappresentazione e migrare i dati. Nessun backfill di massa senza un motivo reale |

### ⛔ Il censimento era dichiarato chiuso il 18/08, ed era incompleto — completato il 20/08/2026

⚠️ **La voce 1 della tabella diceva «✅ FATTO 18/08».** Il 20/08 ne sono state trovate **65
occorrenze residue in 35 file**, e non erano solo commenti: **sei stringhe che l'operatore
legge davvero**.

| Dove                                                 | Diceva                                         | Ora                                    |
| ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| titolo di stampa `store_sale`                        | «Vendita in negozio»                           | «Vendita al banco»                     |
| titolo di stampa `store_return`                      | «Reso vendita al banco»                        | «Reso al banco»                        |
| etichetta famiglia permessi                          | «Vendite e resi negozio»                       | «Vendite e resi al banco»              |
| suggerimento ricavi in analisi                       | «Vendite negozio e online (pagate)»            | «Vendite al banco e online (pagate)»   |
| rifiuto API, creazione da registro                   | «si registrano dalla cassa (Vendita al banco)» | «si registrano dalla Vendita al banco» |
| rifiuto API, conferma ed eliminazione (due messaggi) | «Le vendite e i resi negozio…»                 | «Le vendite e i resi al banco…»        |

⛔ **Il titolo di stampa non è solo stampa.** Il commento della mappa lo dice: è anche _«quello
che l'operatore legge nel Registro alla colonna origine»_. La parola vecchia era quindi in
bella vista in una schermata che si consulta tutti i giorni.

⚠️ **Le due parole erano nella stessa mappa, a una riga di distanza**: la vendita diceva
«Vendita in negozio» e il reso «Reso vendita al banco». Non è una svista isolata — è il segno
che un censimento a occhio non chiude questo tipo di lavoro.

**Restano fuori, ed è la riga «tecnico stabile o contrattuale» della tabella qui sopra:** i
prefissi di numerazione `VN` e `RN` (i numeri già emessi li portano), l'enum
`DocumentType.store_sale` / `store_return`, la tabella `store_sale_payments`. E «negozio» da
solo resta la parola giusta: è l'entità Store.

#### La guardia, perché la lista non basta

`npm run check:terminologia` (dentro `npm run lint`) fa fallire la build se uno dei **nove**
termini rientra in `src/app`, `api/src` o `e2e`.

⛔ **Controlla anche i commenti**, al contrario di `check:registro`: A6 dice che il censimento
copre «documentazione, test, e nomi tecnici», e un commento col nome vecchio è la sorgente da
cui il nome vecchio torna nel codice, al primo copia-incolla. Le righe che **raccontano** il
ritiro — quelle con «ritirato», «legacy», «qui c'era» — restano lecite: sono la memoria del
perché.

⚠️ **Senza la guardia questa sezione si riscriverebbe una terza volta.** Il censimento del
18/08 non era stato fatto male: era stato fatto **a mano**, e un nome vecchio non rompe niente
— compila, passa i test, e continua a insegnare all'operatore una parola che il resto
dell'applicazione non usa più.

## A7. Rapporti con gli altri documenti

**Deciso il 18/08/2026.** «Può avere rapporti documentali» era troppo generico: il progetto
ha **due operazioni distinte**, e non sono sinonimi.

| Operazione            | Che cosa fa                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| **Includi documento** | un documento precedente compatibile viene agganciato **dentro** quello corrente |
| **Genera documento**  | dal documento corrente **nasce** un documento successivo compatibile            |

La Vendita al banco entra nel **sistema documentale comune** e non ha un motore parallelo. In
particolare sono rilevanti le generazioni verso **Fattura** e **Fattura accompagnatoria**.

⚠️ **Non deve nascere un secondo motore Fatture dentro la Vendita al banco.** Se genera una
Fattura, usa il dominio Fattura comune.

### La posizione documentale della Vendita al banco — decisa il 18/08/2026

**La matrice completa vive in `12-specifica-collegamenti-documentali.md`**, che dal 18/08 è la
casa unica dei collegamenti fra documenti.

> ⚠️ **Quello che segue è un ESTRATTO relativo alla Vendita al banco. In caso di divergenza
> prevale la matrice canonica di `12`.**

La copia parziale serve a chi legge questa specifica e non deve saltare altrove per capire dove
sta la Vendita al banco; il prezzo è che può invecchiare, e la riga qui sopra dice chi vince
quando succede.

|                         |                                           |
| ----------------------- | ----------------------------------------- |
| **Includi**             | Preventivo · Ordine cliente · DDT vendita |
| **Genera**              | Fattura · Fattura accompagnatoria         |
| **ed è includibile da** | Fattura · Fattura accompagnatoria         |
| **ed è generabile da**  | Preventivo · Ordine cliente · DDT vendita |

⚠️ **La quarta riga mancava, e la sua assenza faceva leggere l'estratto al contrario.** In `12`
la Vendita al banco è anche **destinazione** di «Genera» per Preventivo, Ordine cliente e DDT
vendita: nell'estratto quei tre comparivano solo come sorgenti di «Includi», cioè una direzione
intera in meno.

⛔ **E qui c'era un diagramma a frecce, tolto**: usava la stessa freccia per «Includi» e
«Genera», che questa sezione dichiara otto righe sopra **non essere sinonimi**.

⚠️ **Le due direzioni non si contraddicono**, ed è il principio già deciso per «Includi
documento»: non è una catena cablata, è **un elenco di documenti a monte** filtrato per
cliente, tipo e stato. L'operatore non è costretto a partire sempre dal predecessore — può
aprire una Fattura e tirarci dentro una Vendita al banco.

⚠️ **L'accompagnatoria include la Vendita al banco ma continua a NON includere il DDT.** La
regola «mai DDT» resta intatta: l'accompagnatoria **sostituisce** il DDT per la stessa
uscita. La Vendita al banco non la viola — può aver già realizzato l'uscita, e
**l'accompagnatoria non produce un proprio movimento di scarico quando lo stesso effetto fisico
è già stato registrato dal documento precedente.**

### Come si costruiscono: col sistema comune, mai con un motore locale

⚠️ **Correzione del 18/08: qui c'era scritto che «i due pulsanti non devono funzionare in
questa fase». Quella decisione non è mai stata presa**, ed è ritirata.

**La Vendita al banco usa davvero «Includi» e «Genera»** quando le relative relazioni sono
implementate. Che la matrice sia un lavoro trasversale **non significa** che qui i comandi
debbano esserci e restare volutamente inattivi: un pulsante che non fa niente è peggio di un
pulsante che non c'è.

⛔ **E non significa nemmeno due pulsanti nuovi con logica propria dentro la Vendita al
banco.** Significa **agganciarla allo stesso sistema Includi/Genera che VestiFlow già usa**,
estendendo dove serve il contratto delle coppie origine → destinazione. Vale identico per
tutti gli altri documenti.

⛔ **Ma l'implementazione passa dal sistema documentale comune**, mai da un motore locale
dentro la Vendita al banco. Il contratto è in `12`; il divario col codice attuale è quasi
tutta la matrice (**B8**), non solo le righe di questo tipo, e si colma lì — punto 10 di
`DA-FARE.md`.

### I nomi del collegamento, e l'azione interna

⛔ **La terminologia della matrice è «Includi» e «Genera», e non ammette categorie parallele.**
La regola vale per tutti i tipi e la sua fonte è `12` — qui non se ne tiene una copia.

⚠️ **«Concludi vendita» non la viola** (**A17**): è l'**azione finale interna** del documento,
quella che lo chiude e ne produce gli effetti, non una terza categoria della matrice.

✅ **Censita il 21/08/2026** la posizione della **Proforma** nella matrice (`12`): non include
nulla, genera verso DDT vendita e Fattura. La cautela sul farla riconfermare è stata ritirata dal
proprietario — la mappatura Includi/Genera è definita, e non si riapre. La questione era nata qui,
ma è un'apertura della matrice e vive in `12`.

### Un solo effetto fisico per una sola uscita — applicazione a questo tipo

⛔ **La regola è del sistema documentale, non della Vendita al banco**, e la sua formulazione
sta in `12`, sopra la matrice, con le catene di esempio e il divieto di trattamenti speciali per
nome di documento. Qui c'è solo come si applica a questo tipo:

```text
Vendita al banco conclusa        → scarico fisico già avvenuto
Vendita al banco → Fattura       → nessun nuovo scarico per la stessa uscita
Vendita al banco → Fattura acc.  → nessun secondo scarico per la stessa uscita
```

⚠️ **E il rovescio conta quanto il dritto:** se la Fattura accompagnatoria è **il primo**
documento che produce davvero l'uscita fisica, il suo normale comportamento di scarico **è
corretto** e non va toccato.

_(Cosa faccia oggi la accompagnatoria quando è lei il primo documento fisico è misurato in
**B11**. È un fatto, non la fonte della regola.)_

## A8. Pagamento

In questa fase il pagamento è **un'informazione interna**: serve a distinguere e filtrare le
vendite nei riepiloghi e nei report. Non è ancora movimento di Tesoreria, registrazione
finanziaria, saldo, allocazione, integrazione POS né sessione di cassa.

**Obbligatorio:** il metodo di pagamento **non si ferma nella schermata della vendita**. Va
preservato fino alla **relativa riga del Registro Corrispettivi**, al **dettaglio della
registrazione del Corrispettivo** e all'**export**.

⚠️ **«Riga» qui significa la riga del REGISTRO**, quella che corrisponde alla Vendita al
banco — **non** le righe articolo del documento. Il pagamento resta un'informazione della
vendita nel suo insieme, **non** un pagamento allocato sulle singole righe prodotto.

**Desiderabile:** un filtro «Pagamento» nel Registro, sui soli metodi realmente configurati.
Se una selezione multipla o un'esclusione («tutto tranne Contanti») è semplice
nell'architettura filtri esistente, tanto meglio; se richiedesse un motore sproporzionato non
è prioritario — si esporta e si filtra fuori.

⚠️ **Quello che non si fa in nessun caso** è un flag `escluso dai Corrispettivi` sulla vendita.
La vendita resta nel Registro; sono filtro ed export a determinare il sottoinsieme che si
vuole analizzare.

**Pagamento misto:** fuori perimetro. Dividere una vendita in più pagamenti strutturati prima
che esista il motore Pagamenti/Tesoreria creerebbe un modello parallelo da rifare. Se serve
rappresentare una vendita pagata con più strumenti, si può valutare una voce informativa
«Misto», senza inventare allocazioni economiche.

## A9. Corrispettivi: come si classifica

**Il Registro è già organizzato così, e la regola corrente è questa** — non «bisogna cambiare
nome ad Ambito», che è una formulazione superata:

```text
Origine              →  la dimensione esposta all'operatore
Online / Fisico-POS  →  raggruppamenti e scorciatoie DELLE origini, non una seconda dimensione
```

⚠️ **Il comportamento esistente va verificato e preservato**, non rifatto (**B10**).

```text
Origine
  Tutte
  Online
      Shopify online
  Fisico/POS
      Vendita al banco
      Shopify POS
      Corrispettivo manuale
```

⚠️ **«Tipo vendita» è stato valutato e scartato**, ed è la scelta che regge tutto il resto:
**«Tipo» nel Registro è già preso**, e vuol dire un'altra cosa —

```text
Tipo       cosa è successo:  Vendita · Reso · Rimborso
Origine    da dove nasce:    Vendita al banco · Shopify online · Shopify POS · Corrispettivo manuale
```

Due filtri adiacenti chiamati «Tipo» e «Tipo vendita» sono la confusione peggiore di quella
che si voleva togliere.

⛔ **Non eliminare il comportamento esistente:** Origine resta la dimensione esposta, e
Online / Fisico-POS restano **raggruppamenti e scorciatoie delle origini**. Chi legge
«Ambito non deve più comparire» e cancella il filtro ha tolto una funzione, non un'etichetta:
le due domande — da dove nasce la vendita, e se è online o fisica — restano entrambe.

_(Quanto di questo il Registro faccia già è misurato in **B10**. La decisione qui sopra non
dipende da quella misura: varrebbe uguale se il Registro non ne avesse niente.)_

⚠️ **Il campo tecnico non si rinomina dentro questo lavoro.** Se internamente funziona, resta
un dettaglio tecnico da riallineare con un intervento suo, dichiarato — non di nascosto dentro
la ristrutturazione della schermata.

⛔ **E non si tocca l'«Ambito di utilizzo» dei Codici IVA**, in Impostazioni: è una parola
uguale per un concetto diverso — dice se un codice vale in acquisto, in vendita o in
entrambi. Rinominarlo perché somiglia sarebbe rompere un'etichetta corretta.

**Una Vendita al banco conclusa** è una vendita reale, entra nel venduto e compare **una sola
volta** nel Registro. **Un Reso al banco concluso** è una rettifica: compare una sola volta,
con segno coerente, e non va letto come nuova vendita positiva.

## A10. Cassa esterna e registratore telematico

```text
Vendita al banco → conclusione → scarico → Corrispettivi interni
→ l'operatore batte la vendita sulla propria cassa esterna
```

VestiFlow deve funzionare anche se il registratore non è collegabile, se la cassa è su un
altro dispositivo, o se alcune vendite vengono battute sul registratore senza passare da
VestiFlow.

**La chiusura giornaliera non è la chiusura fiscale, e VestiFlow non la dichiara tale.**

```text
Vendite registrate in VestiFlow ....... 50 €
Battute solo sul registratore ......... 15 €
VestiFlow conosce 50 · il registratore può conoscere 65
```

VestiFlow mostra i 50 che conosce, **non afferma** che siano la chiusura completa e **non
inventa** i 15 che non conosce.

Fuori perimetro: stato «scontrinato/non scontrinato», emissione RT simulata, lettura della
chiusura fiscale, riconciliazione automatica.

### Il principio, che è tutto quello che serve al modulo

> **VestiFlow non presume di conoscere il documento commerciale emesso dalla cassa esterna.**
> Il Reso al banco non dipende quindi oggi da un riferimento fiscale. Eventuali future
> integrazioni con cassa o RT sono **fuori dal perimetro corrente** e non devono essere
> precluse dall'architettura.

_(Qui c'era una pagina su matricole RT, annulli e livelli di integrazione: era un
approfondimento di contesto, non materia di specifica, e non serve a chi implementa.)_

## A11. Reso al banco

> **Il Reso al banco non è il reso fiscale dello scontrino.** È un documento **gestionale
> interno** che registra il rientro fisico e la rettifica economica conosciuta da VestiFlow.

**Deciso il 18/08/2026.** La chiave è che la vendita di partenza **può non esistere in
VestiFlow**: se è stata battuta su una cassa esterna, il gestionale non ne sa nulla, e il
cliente torna comunque con la merce.

```text
vendita battuta su cassa esterna
→ vendita non necessariamente registrata in VestiFlow
→ il cliente torna con la merce
→ l'operatore registra un Reso al banco
→ rientro in magazzino
→ rettifica economica interna
```

### La regola che governa tutto: nessun documento origine

> **Il Reso al banco non ha un documento origine, e il suo contratto non dipende da una
> vendita precedente.**

⚠️ **Non si scrive «origine facoltativa»**, e la formulazione precedente di questa sezione lo
faceva: è sbagliata perché suggerisce un modello in cui il collegamento c'è e cambia le
regole quando si usa. Il Reso **non è modellato** in nessuna di queste tre forme:

```text
⛔ Reso collegato facoltativamente a una Vendita al banco
⛔ Reso collegato obbligatoriamente a una Vendita al banco
⛔ Reso che, se trova una vendita, cambia comportamento
```

**La ragione è strutturale, non di comodo:** la vendita reale può essere stata eseguita su una
cassa esterna e non essere mai esistita in VestiFlow. Un contratto che presuppone un
documento che può non esserci è un contratto che non regge.

Escono quindi dal piano A, tutte insieme: collegamento alla vendita precedente · tetto sulla
quantità venduta · avviso sulla quantità venduta · quantità già resa su quella vendita ·
recupero del prezzo dalla vendita originaria · **qualunque** confronto venduto/reso.

### Il metodo con cui le regole sono state prese

⛔ **Il metodo conta quanto la decisione, e va scritto.** Il codice applicava già alcune di
queste regole senza che nessuno le avesse decise (**B4**). Sono state decise **guardando il
merito** — cioè partendo dal fatto che la vendita d'origine può non esistere — e la
coincidenza col codice è **un fatto registrato in B, non la ragione** per cui la decisione è
stata presa.

> **«Il codice già lo fa e sembra sensato, quindi lo confermiamo» non è un metodo.**
> Un comportamento accidentale che nessuno contraddice diventa una regola per stanchezza.
> Ogni voce che sale da B ad A deve avere una ragione propria, scritta, che reggerebbe
> **anche se il codice facesse il contrario**.

| Regola                           | Perché è la regola giusta                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **nessun documento origine**     | la vendita reale può non essere mai esistita in VestiFlow: un contratto che la presuppone non regge                                                                                           |
| **IVA dall'anagrafica articolo** | è l'unica fonte disponibile quando non c'è una vendita collegata. ⚠️ Qui è stato confermato **il principio**, non il comportamento: la condizione qui sotto il codice deve ancora soddisfarla |

⚠️ **La condizione sull'IVA, che è parte della decisione e non un dettaglio.** L'aliquota si
prende dall'anagrafica **quando l'articolo entra nella riga**, e da quel momento vale la
normale **regola di snapshot**: si scrive nella riga del documento e non cambia più. Se
domani si modifica il Codice IVA dell'articolo, un Reso di ieri **non deve cambiare
retroattivamente** — è il principio documentale già in uso nella famiglia Fattura.

⚠️ **Che oggi sia così NON è stato verificato**, ed è in **C6**. Senza lo snapshot la regola
«IVA dall'articolo» sarebbe un'altra cosa da quella decisa: sarebbe «IVA dell'articolo com'è
adesso», cioè un documento che si riscrive da solo.

⛔ **Nessun confronto «quantità venduta contro quantità resa», e non è più una questione
aperta.** Non perché sia scomodo: perché senza documento origine **non esiste un venduto con
cui confrontare**. Discende dalla regola qui sopra, non è una scelta a sé.

⛔ **Non si inventano controlli fiscali nel gestionale.** Come il documento commerciale di
reso venga gestito sulla cassa o sul registratore **non si decide qui**. Se un giorno una
cassa compatibile verrà collegata si potrà valutare riconciliazione o emissione collegata;
oggi il Reso al banco è **autonomo**.

### La Nota di credito è il parente più vicino, ma non è la stessa cosa

Se ne riusa il **principio**: quantità e importi restano positivi, ed è il tipo documento a
determinare il verso economico negativo.

```text
Q.tà 1 · Prezzo 50 € · Tipo = Reso al banco
  → effetto economico              −50 €
  → con Carica giacenze ATTIVO     movimento fisico +1
  → con Carica giacenze DISATTIVO  nessun movimento fisico
```

⚠️ **Il verso economico non dipende dalla spunta, il movimento sì** (**A11-ter**, **A18**).

⚠️ **Ma non se ne copia il dominio.** Serve da riferimento per verso economico, quantità
positive, riepiloghi e coerenza documentale — **non per i vincoli fiscali**.

| Nota di credito                        | Reso al banco                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| documento economico/fiscale            | documento gestionale di rettifica della vendita fisica                                |
| può essere collegata a una Fattura     | **non ha** un documento origine                                                       |
| il rientro fisico può essere opzionale | il rientro è il senso del documento, e la spunta di riga decide se quella riga carica |

### Già chiuso altrove — non si riapre qui

Erano elencate fra le aperte, e non lo sono: due sezioni le avevano già decise.

| Domanda                                                                                                    | Dove è decisa |
| ---------------------------------------------------------------------------------------------------------- | ------------- |
| effetto **base** sui Corrispettivi: il Reso compare **una sola volta**, come rettifica, con segno coerente | **A9**        |
| **idempotenza della conclusione**: retry e doppio clic non duplicano il carico                             | **A18**       |

### Il contratto del Reso, chiuso il 18/08/2026

⚠️ **Qui c'erano cinque decisioni aperte. Sono chiuse tutte**, e il contratto del Reso è completo.

|                                 | Deciso                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **documento origine**           | **nessuno.** Resta autonomo: ⛔ non include una Vendita al banco e ⛔ non viene generato da una Vendita al banco                                                                                                                            |
| **prezzo**                      | ⛔ **non si recupera mai da una vendita precedente.** Alla selezione dell'articolo usa i dati economici disponibili nell'**anagrafica**, secondo il **contratto prezzi comune** del gestionale; il prezzo della riga **resta modificabile** |
| **sconto**                      | **identico alla Vendita al banco**: stesso sconto di riga, stesso blocco sconto extra a piè documento (percentuale **e** importo). ⛔ Nessuna logica speciale del Reso                                                                      |
| **causale**                     | **facoltativa.** ⛔ Il comportamento corrente che la rende obbligatoria **va rimosso** (**B4**)                                                                                                                                             |
| **rimborso**                    | per ora **informazione semplice**: nessun movimento di Tesoreria, nessuna allocazione, nessun collegamento al futuro motore Pagamenti                                                                                                       |
| **correggere un Reso concluso** | **come la Vendita al banco** (**A2**): si riapre, si modifica, si salva di nuovo e si elimina, dal riepilogo/elenco del modulo                                                                                                              |

#### La correzione di un Reso concluso segue A2 alla lettera

```text
Reso concluso        carico +2
riapro e porto a 1   → l'effetto DEVE diventare +1
                     ⛔ NON un secondo movimento −1 di rettifica

elimino il Reso      → la Giacenza torna alla situazione precedente
                     → la rettifica sparisce dai Corrispettivi
                     → tutti i lettori derivati si riallineano
```

⚠️ **La spunta di riga resta la sola a decidere il movimento**: `Carica giacenze` attiva → carico
positivo; disattiva → nessun movimento fisico per quella riga (**A11-ter**, **A18**).

#### ⛔ Le due righe che NON entrano nella matrice documentale

**Ritirate il 18/08/2026, prima che diventassero una decisione.** Non sono un'omissione da
completare più avanti:

```text
⛔ Vendita al banco → Genera → Reso al banco
⛔ Reso al banco    → Includi → Vendita al banco
```

⚠️ **La ragione è quella strutturale di tutta questa sezione**: il Reso **non ha** documento
origine, perché la vendita reale può essere stata battuta su una cassa esterna e non essere mai
esistita in VestiFlow. Aggiungere una delle due riaprirebbe dalla porta di servizio un
collegamento che il contratto esclude dalla porta principale.

⛔ **Chi lavora alla matrice di `12` non deve aggiungerle** «per simmetria». La matrice le esclude
di proposito, e questa riga esiste perché fra sei mesi la simmetria sembrerà una svista.

#### Il Reso nel Registro Corrispettivi

> **Un Reso al banco concluso entra UNA SOLA VOLTA nel Registro Corrispettivi, come rettifica
> negativa** — non come nuova vendita positiva (**A9**).

✅ **Implementato il 19/08/2026** come quinta sorgente documentale. Il contratto completo —
segni, conteggi, filtri, origine — è in **`10` §18**, che è la fonte canonica: qui resta la
regola, là come si realizza.

## A11-ter. Merce resa: la spunta di riga, e nient'altro

⚠️ **Qui c'era una sezione «merce non vendibile» con tre strade di modellazione — giacenza non
disponibile, location dedicate, nuovi stati inventariali. **Eliminata il 18/08/2026**: nel
Reso al banco **non esiste** una classificazione vendibile/non vendibile della merce resa, e
non è un problema che questo modulo deve risolvere.

Vale la logica documentale **già comune** a tutti i documenti:

- la riga ha la normale **spunta di carico giacenze**, con l'etichetta del proprio tipo;
- spunta **attiva** → la conclusione del Reso genera il movimento positivo;
- spunta **disattiva** → quella riga non genera il carico.

Merce danneggiata, da scartare o da isolare appartiene a **un altro documento o processo**.
⛔ **Quale, non si inventa ora**, e non è il Reso al banco.

### ⚠️ La spunta decide il MAGAZZINO, non la presenza economica _(verificato il 19/08/2026)_

> **Un Reso con la spunta spenta su TUTTE le righe non genera alcun movimento, e nel Registro
> Corrispettivi entra lo stesso, come rettifica negativa.**

Sono due domande diverse, e la spunta risponde solo alla prima:

```text
la spunta      la merce RIENTRA IN GIACENZA?
il Registro    il cliente HA RESO, e quanto gli si e' reso?
```

Un capo difettoso torna, si rimborsa, e in magazzino non ci va: il corrispettivo va abbattuto
lo stesso, perché **il denaro è uscito**. Se la spunta governasse anche il Registro, quel reso
sparirebbe da un registro fiscale.

Il Registro quella spunta **non la filtra e non la legge affatto** — nessuna clausola su
`lines`, nessun `loadsStock` nel `select` — e tre prove lo inchiodano, perché una fixture con
le righe spente passerebbe anche con un'implementazione che la consulta.

### Direzione trasversale, da annotare e non da implementare qui

Nei documenti che usano la spunta di riga servirà anche un **comando a livello documento** che
la attivi o disattivi **in blocco su tutte le righe**: con molte righe non è accettabile
obbligare l'operatore a toccarla articolo per articolo.

⚠️ È un **requisito trasversale dei documenti**, non una logica inventariale della Vendita al
banco. Sta scritto qui perché è emerso qui, non perché appartenga a questo modulo.

## A11-quater. ⭐ CHE COSA EREDITA dalla base comune — 20/08/2026

_Aggiunta al rientro dal blocco «grammatica dei riepiloghi». Serve a chi riprende questo
documento: **non si progetta niente di quanto sta qui sotto**, esiste già e si adotta._

⛔ **L'Ordine cliente resta il riferimento MOBILE e OPERATIVO**, non quello grafico del
desktop (§A12, ristretto il 21/08/2026). L'elenco della Vendita al banco **non parte da lui**:
parte dal motore comune, che nel frattempo è diventato la base di quattro riepiloghi — e la
maschera prende da lui i pezzi già risolti, non l'aspetto.

| Che cosa                      | Dov'è                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| **motore tabella**            | `shared/components/data-table` — scheletro, sezioni, celle proiettate                         |
| **ordinamento**               | `DataTableSort[]`, unica grammatica; il parametro HTTP è la sua serializzazione               |
| **selezione e azioni**        | `ListAction` + `app-list-actions-bar`: la barra è permanente, la selezione ne cambia l'ambito |
| **clic di riga → Modifica**   | `DOCUMENT_ROW_OPENS`, esaustivo per tipo                                                      |
| **Dettaglio**                 | funzione distinta dalla Modifica, con il suo pulsante                                         |
| **grammatica visiva**         | `summary-grammar()`: 12px · 4×12 · intestazione 32px MAIUSCOLA · niente divisori              |
| **niente pagine, 30 giorni**  | i riepiloghi non impaginano; il tetto si dichiara nel meta                                    |
| **ripiego a card sotto `lg`** | dal motore, con la card progettata dei Corrispettivi come riferimento mobile                  |

## ✅ VERIFICATO il 21/08/2026 — l'elenco non è da fare

|                           |                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Scarico manuale**       | è già un profilo di `DocumentListComponent`: **nessun lavoro di convergenza** del riepilogo                      |
| **Vendita/Reso al banco** | ha già il profilo `store-sale` ed è già sul motore comune: ⛔ **l'elenco non va ricostruito né ridisegnato ora** |

⭐ **La fase che segue riguarda quindi SOLO la maschera** «Nuova vendita al banco» / «Nuovo reso
al banco». L'elenco esiste, è sul motore, ed eredita quanto deciso in questi due giorni.

⭐ **E il riepilogo dello Scarico manuale è già dentro**: è uno degli otto profili di
`DocumentListComponent`, quindi eredita tutto quanto sopra senza migrazioni — censito il
21/08/2026. Il suo **dominio** resta suo: la deroga sui movimenti (aggiorna la giacenza senza
crearne) non c'entra con la struttura dell'elenco.

⚠️ **Quello che NON è ancora comune**, e che quindi va deciso quando ci si arriva: la vista a
card della **riga documento** in inserimento (`app-document-line-card`, sette maschere) è cosa
diversa dalla card di un riepilogo — là il chevron apre i campi da compilare, qui naviga.

⭐ **Due gap noti e dichiarati**, che non bloccano nulla: la colonna «Controparte» dell'elenco
documenti e lo «Stato» dell'Ordine cliente non si ordinano ancora (`14` §H15). Non riguardano
la Vendita al banco.

---

## A12. Interfaccia: si parte da Ordine cliente, senza ereditarne il dominio

**Deciso il 18/08/2026, e la formulazione precedente era troppo vaga.** Non «stessa famiglia
visiva»: **Ordine cliente è l'implementazione concreta di riferimento da cui partire.**

⚠️ **RISTRETTO il 21/08/2026**, dal proprietario: «Ordine cliente è soprattutto il riferimento
**mobile/operativo**; il desktop non va copiato graficamente e l'elenco Vendita/Reso deve
nascere sulla grammatica comune dei riepiloghi». La formulazione qui sotto era diventata troppo
ampia mentre quella base comune veniva costruita — e §A11-quater dice che cosa c'è ora.

```text
NO   guardo Ordine cliente → progetto una nuova schermata simile
SÌ   ispeziono Ordine cliente → individuo i pezzi già risolti → li riuso o li estraggo
     → costruisco la Vendita al banco sopra quella base
```

- **mobile e comportamento operativo**: fonte concreta è l'Ordine cliente — è lì che il
  riferimento vale per intero;
- ⛔ **il DESKTOP non si copia graficamente** _(ristretto il 21/08/2026)_: la sua grammatica
  ora viene dalla **base comune dei riepiloghi** — motore tabella, densità, intestazione,
  ordinamento. Copiare l'aspetto di una schermata significherebbe rifare a mano ciò che il
  motore già dà, e divergere dal giorno dopo;
- ciò che resta dell'Ordine cliente desktop è **quello che ha già risolto**: componenti, celle
  di riga, primitive — da riusare o estrarre, non da imitare;
- se un pezzo utile non è ancora un componente condiviso, si valuta di **estrarlo**, non di
  rifarlo in proprio;
- si toglie ciò che appartiene al dominio Ordine cliente; si aggiunge ciò che è specifico
  della Vendita al banco.

### ⚠️ Riuso sì, dominio assolutamente no

L'Ordine cliente rappresenta un **impegno commerciale**: muove l'Impegnata e **non** diminuisce
subito la Giacenza. La Vendita al banco fa l'opposto.

```text
Ordine cliente     → impegna, non scarica subito
Vendita al banco   → non impegna, alla conclusione scarica davvero
Reso al banco      → non impegna, alla conclusione genera il rientro reale
```

Non si trascinano: impegni, conclusione dell'ordine, stati dell'ordine, documenti specifici
dell'ordine. Si riusano struttura, componenti e primitive comuni.

### ⚠️ Non si forcano le aree che il lavoro `03` sta unificando

`03` sta unificando le righe documento, e non è finito. Estrarre oggi una parte che domani
viene sostituita produrrebbe due strade — quella della Vendita al banco e quella unificata —
cioè esattamente la divergenza che `03` esiste per togliere.

**Regola:** riutilizzare direttamente i componenti comuni **già stabilizzati** e quelli che
risultano dal lavoro di unificazione. **Non creare componenti paralleli** per aree che sono
oggi oggetto di `03`.

## A13. Testata

Come l'Ordine cliente, con i soli campi necessari: **Location**, **Cliente** (facoltativo),
e il numero secondo il sistema comune (**A5**).

⛔ **Il netto/ivato NON sta qui.** Il suo selettore è nella **testata della colonna Prezzo**,
com'è già negli altri documenti (**A4**): non si introduce un controllo dedicato nella testata
del documento.

**Location.** Determina il magazzino movimentato, quindi:

- se esiste una Location predefinita valida, viene proposta;
- se ne esiste una sola utilizzabile, può essere precompilata;
- se non è selezionata e ce ne sono più possibili, **non si prosegue** finché non se ne
  sceglie una;
- il default precompila ma resta modificabile.

Non si creano righe movimentabili senza una Location valida.

## A14. Inserimento articolo, ricerca e scansione

**Una sola porta d'ingresso** per pistola e tastiera, sul modello dell'area di ricerca
dell'Ordine cliente. Non una card gigante dedicata.

> Scansiona EAN, inserisci codice/SKU o cerca articolo…

Gestisce EAN, SKU, codice articolo, nome prodotto e ricerca testuale.

**Ricerca manuale.** Si digita; se non c'è corrispondenza esatta compaiono risultati
contestuali, navigabili da tastiera; **solo la selezione reale crea la riga** — la query
digitata non è una riga. Dopo l'aggiunta il campo si pulisce ed è di nuovo pronto. Nessuna
creazione implicita di articoli, nessun movimento di magazzino durante la ricerca.

### Scansione — due livelli

**Standard (scanner HID / keyboard wedge).** Molti lettori si presentano come tastiera, e a
livello browser non si può dare per certo che una sequenza venga dallo scanner.

```text
scanner → codice + terminatore → ricerca esatta → aggiunta o incremento
→ pulizia input → di nuovo pronto
```

Requisiti minimi: il campo torna attivo subito; una scansione completa non produce effetti
carattere per carattere; l'azione avviene solo a sequenza conclusa; un EAN non trovato non
crea righe; la scansione non genera movimenti; salvataggi e aggiornamenti UI **non rubano il
fuoco**.

⚠️ **Il rischio da gestire:** se l'operatore sta modificando Prezzo, Quantità, Sconto o Nome e
usa subito lo scanner, il barcode **non deve finire nel campo attivo**. La soluzione si decide
dopo il censimento del motore scanner e del fuoco.

**Avanzata (lettori configurabili).** Per i lettori che permettono prefisso/suffisso:

```text
PREFISSO_SCANNER + CODICE + SUFFISSO/ENTER
```

VestiFlow riconosce la firma, intercetta la sequenza, evita che finisca in un campo, la manda
alla ricerca e torna pronto. **Non è obbligatoria:** chi non ha un lettore configurabile usa
la modalità standard. Un'impostazione «Configura lettore barcode» potrà seguire.

### Comportamento EAN

| Caso                           | Effetto                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **trovato**                    | articolo aggiunto                                                                                                           |
| **già presente nella vendita** | **incremento della quantità** sulla stessa riga, non una riga nuova                                                         |
| **non trovato**                | **segnale acustico** · nessuna riga · nessun popup · nessuna creazione automatica · subito pronto alla scansione successiva |

Le scansioni consecutive veloci non devono perdere codici, duplicare per retry, contaminare il
campo precedente, perdere il fuoco o creare movimenti anticipati.

## A15. Righe

Desktop: tabella con la densità della **grammatica comune dei riepiloghi** (`14` §F6 — 12px,
padding 4×12, intestazione 32px), senza le informazioni che alla Vendita al
banco non servono.

| Articolo | Q.tà | Prezzo | Sconto | IVA | Totale | Azioni |
| -------- | ---: | -----: | -----: | --: | -----: | ------ |

L'articolo ha lo spazio maggiore. Informazioni secondarie possibili: variante, SKU, EAN,
disponibilità. È previsto il pulsante **Colonne**, coerente con gli altri documenti: la vista
base resta essenziale, l'operatore aggiunge ciò che gli serve.

**Modificabili direttamente dalla riga:** nome/descrizione, quantità, prezzo, sconto di riga.
Il totale di riga è calcolato. La quantità supporta digitazione diretta e stepper − / valore /

- dove adatto. La modifica del nome riguarda il testo della riga, non l'anagrafica.

Mobile: card sul modello dell'Ordine cliente — nome leggibile subito, codici e disponibilità
subordinati, quantità con stepper, prezzo e sconto rapidamente editabili, totale ben leggibile.

## A16. Sconti

### Deciso

> **Il documento ha lo Sconto extra a piè documento, con un campo PERCENTUALE e un campo
> IMPORTO, coerente con gli altri documenti VestiFlow.**

E lo **sconto di riga**, modificabile direttamente sulla riga, secondo il contratto sconti
comune.

⚠️ **Due campi, non uno**: il fatto che ci siano più aliquote **non è un motivo per togliere
l'importo** — è un caso che il modello economico deve saper gestire, non una funzione da
sacrificare.

⛔ **Si riusa il comportamento comune già presente negli altri documenti**, quanto più
possibile. Il calcolo lo fa il motore economico comune, mai una logica ad hoc di questa
maschera.

### ⛔ Se il contratto comune non basta, lo si SEGNALA

> **Se durante l'implementazione emerge che il contratto comune è incompleto o incoerente, lo
> si segnala. Non si inventa una logica locale.**

⚠️ **E non è un caso ipotetico: il contratto comune oggi NON basta** — ha solo la percentuale,
e la misura è in **B12**.

Quindi la decisione qui sopra — due campi — **richiede di estendere il contratto comune**, e
quella estensione va fatta **dove il contratto vive**, non aggiungendo un campo locale alla
Vendita al banco. Un importo che esiste in una maschera sola è esattamente la logica locale
che questa regola vieta.

### Fuori da questa specifica

Le **regole di calcolo** dello sconto extra — se percentuale e importo siano cumulabili o
alternativi, in che ordine si applicano, come si arrotondano, come si comportano con più
aliquote e col castelletto — **non sono decisioni della Vendita al banco**. Sono del motore
economico comune, e la risposta deve valere **identica su ogni documento** che ha uno sconto
extra: deciderle qui produrrebbe una regola valida per una maschera sola.

⚠️ **Non esiste ancora una specifica che le ospiti** — verificato il 18/08: nessun file in
`docs/` le governa. Stanno quindi in `DA-FARE.md` come lavoro trasversale, ed è lì che vanno
cercate. **Per questo non compaiono nell'elenco delle aperte in testa a questo documento**:
quello elenca le decisioni **della Vendita al banco**, e queste non lo sono.

## A17. Riepilogo e conclusione

Piede come gli altri documenti, con le sole informazioni necessarie: totali dal motore
economico comune, sconto extra, IVA, totale, pagamento informativo, azione finale. Il totale
dev'essere chiaramente leggibile.

L'azione principale dice **«Concludi vendita»** o **«Concludi reso»**, e il suo significato
dev'essere inequivocabile: è il momento in cui nasce l'effetto fisico ed economico.

⚠️ **Questo non contraddice «solo Includi e Genera» (A7).** «Concludi vendita» è l'**azione
finale interna** del documento — quella che lo chiude e produce i suoi effetti — non una terza
categoria della matrice documentale. Le due cose vivono su piani diversi e non vanno
uniformate.

## A18. Stock e movimenti

**Scansione, ricerca, aggiunta e modifica non creano movimenti.** Lo scarico avviene solo alla
conclusione.

Alla conclusione della **vendita**: una riga movimentabile → un movimento negativo, collegato a
documento e riga con identità stabile, tenant e Location rispettati, retry e doppio clic
idempotenti, e nessun secondo scarico generato da Corrispettivi o report.

Alla conclusione del **reso**: il carico segue la **spunta di riga**, non la quantità in sé —
ed è la logica documentale comune, la stessa di tutti gli altri documenti.

```text
Reso concluso + riga con Carica giacenze ATTIVO      → movimento positivo
Reso concluso + riga con Carica giacenze DISATTIVO   → nessun movimento di carico per quella riga
```

Il movimento è collegato a documento e riga; retry e doppio clic non duplicano il carico;
l'effetto economico è una **rettifica**, non una vendita positiva.

⛔ **Nel Reso non esiste una classificazione «vendibile / non vendibile»** (vedi **A11-ter**).
Merce danneggiata, da scartare o da isolare appartiene a **un altro documento o processo**, e
quale non si inventa qui.

**Stock insufficiente:** la vendita oltre la disponibilità è consentita. Warning visibile, **non
bloccante**; Giacenza e Disponibile possono diventare negative.

## A19. Fuoco e tastiera

È un requisito funzionale, non una rifinitura. Va verificato dopo: scansione riuscita,
selezione da ricerca, modifica di quantità, prezzo, sconto e nome, eliminazione riga,
salvataggi e aggiornamenti asincroni, EAN non trovato.

L'operatore non deve riposizionare il cursore per continuare una sequenza di scansioni.

## A20. Aspetto visivo

Colori, token, componenti e regole visive sono quelli già definiti per VestiFlow: questa
specifica **non introduce una palette autonoma**.

⚠️ **Densità e spaziatura vengono dalla GRAMMATICA COMUNE** (`14` §F6), non dall'Ordine
cliente _(corretto il 21/08/2026: qui c'era «il riferimento è l'Ordine cliente», scritto prima
che la grammatica esistesse)_. L'Ordine cliente resta il riferimento **mobile e operativo**, e
la fonte dei pezzi che ha già risolto — non la fonte dell'aspetto desktop.

## A21. Da valutare, non ancora approvato — riga manuale senza articolo

Una modalità che non blocchi la vendita quando l'articolo non esiste ancora:

```text
Nome manuale + Prezzo + Quantità
```

Non si implementa prima di aver deciso: se è una riga libera non collegata a Product/Variant;
se movimenta stock; come è identificata nel movimento; come entra nei Corrispettivi; IVA e
codice IVA; se può poi creare o agganciare un prodotto; come si evitano righe ambigue.

## A22. Criteri di accettazione

Erano nel testo consegnato e in una stesura precedente di questo file **erano stati persi**.
Non sono test: sono il modo in cui si riconosce che una fetta è finita.

| Scenario                                                                   | Atteso                                                                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **scansione rapida** — EAN A · EAN B · EAN C                               | tre articoli inseriti · nessun movimento prima della conclusione · nessuna perdita di fuoco · nessuna duplicazione tecnica                         |
| **ricerca + scanner** — scanner A · digito il nome · seleziono · scanner B | le due modalità convivono · la query si pulisce dopo la selezione · lo scanner è subito operativo                                                  |
| **modifica + scanner** — scanner A · modifico il prezzo · scanner B        | prezzo di A corretto · il barcode di B **non** contamina il campo prezzo · B passa dal percorso scanner                                            |
| **EAN ripetuto** — EAN A · EAN A                                           | stessa riga · quantità incrementata · nessun doppio effetto fisico prima della conclusione                                                         |
| **EAN non trovato**                                                        | segnale acustico · nessuna riga · nessun popup · subito pronto alla scansione successiva                                                           |
| **Location mancante** — più location, nessuna predefinita                  | non si prosegue finché non se ne scegle una · nessuna riga movimentabile confermata senza Location valida                                          |
| **stock insufficiente**                                                    | warning non bloccante · vendita concludibile · **un solo** movimento per riga alla conclusione · Giacenza e Disponibile possono diventare negative |
| **retry sulla conclusione**                                                | una sola vendita o reso · un solo effetto fisico per riga · una sola presenza economica nei Corrispettivi                                          |
| **tenant senza Shopify**                                                   | modulo completamente utilizzabile · nessun campo, banner, errore o indicatore Shopify non pertinente                                               |

---

# B · COMPORTAMENTO OSSERVATO

Misurato nel repository il **18/08/2026**. Descrive ciò che il codice fa oggi, non ciò che
deve fare. Dove diverge dal piano A, l'intervento è in **C**.

## B1. La Vendita al banco è già un documento

Il servizio della cassa crea `document` e `stockMovement` **nella stessa transazione**, con due
percorsi distinti: vendita e reso. Non passa da `SalesOrder`.

⚠️ **Questo chiude una biforcazione che i documenti precedenti tenevano aperta** — «creare un
ordine» contro «far diventare il Registro un'unione». Nessuna delle due: è già un documento, e
la domanda non va riaperta.

## B2. Esistono due rotte, e non sono un doppione

| Rotta                        | Cosa fa                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| la schermata operativa       | dove si esegue la vendita o il reso                        |
| l'elenco/dettaglio documenti | archivio delle vendite prodotte, **in sola consultazione** |

Il commento nel codice dichiara che i documenti «nascono in transazione con i movimenti e non
si modificano né si eliminano da qui».

⚠️ **A2 ha deciso il contrario** (18/08/2026): una vendita conclusa si riapre, si modifica, si
salva di nuovo e si elimina. Questo blocco non è quindi la regola — è **il divario più grande fra
decisione e codice**, e l'intervento che lo colma è **C 0**.

## B3. Netto/ivato: oggi è forzato, e in due modi

- i due tipi **non appartengono** all'elenco dei tipi che rispondono alla modalità prezzo;
- il servizio scrive il flag «prezzi ivati» **come costante**, sia sulla vendita sia sul reso;
- il calcolo del reso usa una modalità costo fissata nel codice.

Non è una convenzione implicita: è un forcing scritto. Il piano A4 lo rimuove.

## B4. Il Reso al banco esiste già — e su due punti NON è conforme

**Interfaccia.** Un interruttore commuta vendita/reso **in qualsiasi momento** — e **A3** lo
sostituisce con due tasti alla creazione. **Non svuota il carrello**, mentre il cambio di
Location lo svuota e il codice spiega perché: i due percorsi usano stati diversi, quindi il
carrello resta lì mentre si compila un reso.

⛔ **Entrando in modalità reso il codice carica le vendite recenti**, e tornando a vendita
rimette il fuoco sulla ricerca. Il caricamento serve al collegamento dell'origine, che **A11**
ha **escluso dal contratto**: va **censito per individuare tutti i consumer, e quindi rimosso
o riallineato**.

⚠️ **Il censimento non serve a decidere se tenerlo** — quella decisione è presa. Serve a non
rompere altro togliendolo.

**Percorso reso, misurato:**

| Aspetto                   | Comportamento oggi                                               | Rispetto ad A11                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collegamento alla vendita | **facoltativo**; se indicato, è validato                         | ⛔ **da riallineare**: A11 stabilisce che il Reso **non ha** documento origine. Questo percorso è legacy, non il contratto                                                      |
| tetto sulla quantità      | **nessuno**                                                      | ✅ non è più materia: **l'origine esce dal contratto**, quindi non c'è nulla da cui derivare un tetto                                                                           |
| IVA                       | **non quella incassata**: prende quella corrente dell'articolo   | ◐ **coincide solo in parte**: A11 conferma la fonte, ma pretende lo **snapshot di riga**, e che oggi ci sia **non è verificato** (C 6)                                          |
| prezzo                    | dalla riga, con l'intento dichiarato di rendere quanto incassato | **A11 decide il contrario**: mai da una vendita precedente, ma dall'anagrafica secondo il contratto prezzi comune — **C 7**                                                     |
| causale                   | **obbligatoria**                                                 | ⛔ **A11 la rende FACOLTATIVA**: il vincolo attuale va rimosso — **C 7**                                                                                                        |
| movimento                 | nasce solo per le righe con la spunta di carico attiva           | ✅ è la logica documentale comune (**A11-ter**) — ⛔ ma la distinzione «vendibile / non vendibile» con cui il codice la pilota è **legacy e non pertinente** al contratto nuovo |
| numerazione               | sistema canonico comune, prefisso dalle impostazioni             | **già conforme ad A5**                                                                                                                                                          |

## B5. Numerazione: già comune

Prefisso e titolo di stampa dei due tipi stanno nella **stessa tabella di tutti gli altri
documenti**, e il servizio usa serie, lock del contatore e formattazione canonici. Non c'è
nulla di dedicato da smontare.

⚠️ Nella stessa tabella è annotato che `docs/04` §11 toglierà sigla e zeri dal numero visibile
di tutti i documenti: la riga dei due tipi cadrà insieme alle altre.

## B6. Terminologia: la rinomina precedente è incompleta

Il titolo di stampa dei due tipi è oggi **«Vendita in negozio»** e «Reso vendita al banco»: una
rinomina passata ha preso il reso e ha mancato la vendita. Restano una trentina di occorrenze
di terminologia legacy nel codice non-test.

Le **causali dei movimenti nuovi** dicono già «Vendita al banco». Solo le righe storiche
riportano la dicitura vecchia.

## B7. La Vendita al banco è già nel report del venduto

Il venduto si costruisce sui **movimenti**, non sugli ordini: un movimento di vendita che porta
il riferimento al documento porta con sé il ricavo della propria riga. Quindi la Vendita al
banco entra nel venduto **da sempre**, e non va introdotto un secondo percorso.

## B8. La Vendita al banco non è in nessuna delle due mappature — misurato

⚠️ **La misura tecnica completa del motore Includi/Genera è in `docs/12` sezione B**, ed è la
**sede unica**: qui resta la sola sintesi che riguarda questo modulo. Non se ne tiene una copia,
né della matrice né della misura.

**Quello che riguarda la Vendita al banco, in due righe:**

- **non compare in nessuna delle due mappature, in nessuna direzione** — né come sorgente né
  come destinazione;
- la **Fattura accompagnatoria non è destinazione di nessuno**: oggi non la genera nessun tipo.

⚠️ **Sul motore, la formulazione va presa dalla misura e non semplificata.** Il proprietario
aveva scritto che «il sistema esiste già ed è operativo su una parte delle relazioni», e la
conclusione che se ne era tratta qui — «il divario non è un motore mancante, è una copertura
incompleta» — **è troppo semplificata dopo il censimento**:

> **Esistono già più meccanismi operativi parziali; il quadro tecnico completo è in `12` §B.**

⛔ **Ciò che il codice fa oggi non si cancella per far posto alla matrice**: le conversioni in
uso restano. La matrice dice dove si deve arrivare, non che l'esistente sia sbagliato.

## B9. La schermata non condivide nulla con lo scheletro documentale

Circa 2900 righe fra logica, template e stile, con un foglio di stile proprio e **zero** classi
della grammatica documentale. Il piano A12 è quindi una ristrutturazione, non una rifinitura.

## B10. «Ambito» è già stato ritirato dal Registro

Nel Registro Corrispettivi la parola **non è più un filtro**, e il template lo dichiara. Il
controllo Online/Fisico-POS vive **dentro il pannello di Origine** come scorciatoia sulle
origini — non come dimensione a sé. È già la forma decisa in **A9**.

Anche il chip «Canale» è stato tolto perché ridondante: **il dato resta nel modello, nell'API
e nella lettura dell'indirizzo**, così un collegamento salvato o una stampa aperta da un URL
vecchio continuano a filtrare come prima. Si è semplificata la UI, non il modello.

⛔ **Restano invece due «Ambito» che NON sono questo**, e non vanno toccati: l'«Ambito di
utilizzo» dei Codici IVA in Impostazioni — che dice se un codice vale in acquisto, in vendita
o in entrambi — e i commenti nel codice che spiegano perché la dimensione è stata ritirata.

## B11. La Fattura accompagnatoria scarica alla conferma

Misurato: la funzione che decide se un tipo scarica il magazzino alla conferma risponde **sì**
per la Fattura accompagnatoria, e c'è un test che lo inchioda.

⚠️ **È un fatto, non la fonte della regola.** La regola di **A7** — un solo effetto fisico per
una sola uscita — vale per il sistema documentale comune, e questa misura dice soltanto che
quando la accompagnatoria è **il primo** documento fisico il suo scarico è quello giusto. Il
caso da governare è quando **non** è il primo.

## B12. Lo sconto documento oggi è solo una percentuale

Misurato il 18/08: il campo d'ingresso è `documentDiscountPercent`, e il risultato calcolato è
un importo derivato. **Un campo importo in ingresso non esiste**, in nessun documento e in
nessuno strato — modello, mapper, schema.

⚠️ La decisione che ne discende — due campi, e l'estensione fatta dove il contratto vive — è in
**A16**.

## B13. ✅ Il Reso al banco entra nel Registro Corrispettivi — RISOLTO il 19/08/2026

**Com'era, e per questo la misura esisteva.** Il filtro del Registro era un'uguaglianza secca
su un tipo solo — `type: DocumentType.store_sale`: `store_return` non compariva, e ne
discendeva che **l'incasso lordo non era diminuito da nessun reso di cassa**. — _letto_

**Com'è ora.** `store_return` è la **quinta sorgente** del Registro, documentale e autonoma:
`kind: refund`, `refundKind: return_with_restock`, importi negativi nella vista, conteggio in
`refundCount`. La fonte canonica della decisione e del contratto è **`10` §18**.

⛔ **Non è l'allargamento del ramo `store_sale`**, ed è la parte da non dimenticare:
allargarlo a `{ in: [store_sale, store_return] }` è una riga sola e produce un errore di
**segno** — il reso entrerebbe dal ramo che mappa `kind: 'sale'`, quindi **alzerebbe** il
registro invece di abbassarlo.

Intervento **C 8b**, eseguito e verificato anche sul database reale. La regola resta in **A11**.

---

# C · INTERVENTI CONSEGUENTI

In ordine di dipendenza, non di importanza. Ogni voce nasce da A confrontato con B.

### ⛔ Da dove si comincia — riscritto il 18/08/2026 dopo la decisione A2

⚠️ **Qui c'era un ordine in tre fasi tutte di interfaccia — ingresso, separazione, maschera — e
si contraddiceva con la tabella qui sotto**, che dichiara di essere «in ordine di dipendenza» e
mette **C 0** per primo. La contraddizione è nata da **A2**: prima che fosse decisa, riaprire e
modificare una vendita conclusa non era in programma.

```text
PREREQUISITO TECNICO — C 0
  Vendita e Reso conclusi:
    → riapertura                              ✅ fatto
    → modifica                                ✅ fatto
    → salvataggio                             ✅ fatto
    → eliminazione                            ❌ NON fatto — flow-only rifiuta
    → riconciliazione PER DIFFERENZA          ✅ fatto
    → riallineamento di tutti gli effetti derivati

  poi, e solo dopo:

FASE UI 1   ✅ FATTA 19/08   elenco → [ Nuova vendita al banco ]  [ Nuovo reso al banco ]
FASE UI 2   ✅ FATTA 19/08   via il toggle interno: il tipo lo decide la ROTTA
FASE UI 3   ⛔ APERTA        la maschera, ricostruita sull'Ordine cliente
                             ↳ ⚠️ qui c'era «si chiude INSIEME a C 3b»: non è andata così
C 3b        ✅ FATTO 19/08   la riga apre la modifica, e la maschera carica per id
                             ↳ chiuso SENZA ristrutturare la maschera: la dipendenza non c'era
```

### ⚠️ Il prerequisito è soddisfatto A META', e la conseguenza cade sulla FASE UI 1

Il paragrafo qui sotto avvertiva di un caso preciso — «costruire un elenco con azioni che l'API
rifiuta» — e quel caso **è esattamente lo stato di oggi**, non più un'ipotesi:

> **Un elenco con il comando «Elimina» sarebbe un comando che l'API rifiuta con 409.**

Modifica e riapertura invece reggono: un elenco che apre un documento concluso e lo lascia
correggere è già costruibile sulla base definitiva.

⛔ **La scelta non si fa di straforo mentre si scrive l'elenco.** O si completa `C 0` togliendo i
due tipi da `FLOW_ONLY_DOCUMENT_TYPES` con la neutralizzazione degli effetti, oppure la
**FASE UI 1 nasce senza il comando di eliminazione** — e va detto, non lasciato scoprire a chi lo
cerca. Le due strade non si equivalgono: la seconda è un rinvio dichiarato, non una riduzione
del requisito.

### ✅ La riga apre la MODIFICA — fatto il 19/08/2026

> **La destinazione finale del clic di riga è la maschera di modifica del documento
> esistente.** L'anteprima resta, come flusso **separato**.

È la regola generale VestiFlow, non una scelta di questo modulo:
`regole-gestionale` → «Il clic di riga su un documento apre la MODIFICA».

**Chiuso dal commit `0accf2f2`.** Riverificato nel codice il 20/08/2026, non nel solo messaggio
di commit — che non è una misura:

```text
/app/vendita-al-banco/vendita/:id/edit   ✅ rotta esistente — «Modifica vendita al banco»
/app/vendita-al-banco/reso/:id/edit      ✅ rotta esistente — «Modifica reso al banco»
store-sale-register.component            ✅ editDocumentId da paramMap, isEditMode
DOCUMENT_ROW_OPENS[store_sale|store_return]  ✅ 'form'
```

Le due rotte di modifica portano **le stesse due guardie** della creazione e prendono il tipo
dai `data:`, non dal documento letto: è il pattern comune, e il difetto che evita è quello
misurato in `07` §18.

⚠️ **La quarta riga diceva `rowOpensForm: true` fino al 20/08/2026**, ed era la
configurazione di PROFILO che accendeva il comportamento su un elenco per volta. È caduta lo
stesso giorno: la regola è diventata comune a **ogni** elenco documentale (`14` §2), e ciò
che vale per tutti non è una preferenza da configurare. Al suo posto c'è un `Record`
esaustivo per tipo, dove un tipo nuovo senza decisione non compila.

#### ⚠️ Qui c'era «NON completato», con una previsione che i fatti hanno smentito

Il testo precedente legava due requisiti — _«I due requisiti si chiudono INSIEME: apertura in
modifica + caricamento per id»_ — e li rimandava **entrambi** alla FASE UI 3, sulla misura di
allora: `rowOpensForm` avrebbe puntato a una rotta inesistente, e la maschera non sapeva
caricare per id.

**Le due misure sono superate, ma la previsione era comunque sbagliata**: il caricamento per id
è stato fatto **senza** ristrutturare la maschera. La dipendenza non c'era.

⛔ **Quindi la FASE UI 3 non si spunta con questo commit, e resta APERTA.** Ciò che manca è la
voce **10** della tabella — la schermata ricostruita sull'Ordine cliente — e la misura di **B9**
è ancora vera al 20/08/2026:

```text
store-sale-register.component.html   0 classi `doc-form`, 0 celle `app-document-line-*`
store-sale-register.component.scss   639 righe proprie, NON usa `_document-form.scss`
                                     (le sei maschere documentali lo usano)
```

⚠️ **Prima di implementare la UI 3**: censire come funziona apertura e modifica negli **altri**
documenti e riusare il pattern comune. ⛔ Nessuna convenzione speciale per la Vendita al banco —
se si aprisse diversamente dagli altri, l'operatore dovrebbe ricordarsi quale.

## ⛔ Il «Carrello» non esiste più — deciso il 19/08/2026

> **La Vendita al banco è un DOCUMENTO VestiFlow: testata, righe documento, piede.
> Non una cassa con un carrello.**

`CartLine[]` è **legacy** della vecchia impostazione a mini-cassa, quando il banco era
trattato come un registratore e non come un documento. Anche i documenti vecchi lo
chiamano esplicitamente «carrello».

⛔ **In UI 3 il concetto di Carrello non si preserva**, né come struttura funzionale né
come elemento di interfaccia. Si prende la **grammatica degli altri documenti** —
Ordine cliente e fratelli — mantenendo la velocità operativa del banco.

```text
OGGI      ricerca/scanner → «aggiungi al carrello» → CartLine[] → Concludi vendita
UI 3      ricerca/scanner → RIGA DOCUMENTO         → righe      → Salva documento
```

⚠️ **La misura tecnica che sembrava un difetto da correggere era in realtà una prova.**
Il censimento del 19/08 ha trovato che il carrello è indicizzato per `variantId` e non
per riga: due righe dello stesso articolo collassano in una, e al salvataggio la seconda
sparirebbe **col suo movimento**. Non è un difetto da riparare nel carrello: è **un
motivo in più per cui il carrello va superato**. Le righe documento hanno un'identità
propria, ed è quella che serve.

La fusione per variante resta **solo nella scansione** — è ciò che fa l'Ordine cliente in
`applyScannedVariant`, che agisce su righe con id, non sulla struttura dati.

### Lo SKU è un dato VISIBILE della riga — deciso il 19/08/2026

> **`Articolo · SKU · Q.tà · Prezzo · Sconto · IVA · Totale`**

| Dove    | Come                                                                |
| ------- | ------------------------------------------------------------------- |
| desktop | **colonna vera**, ordinabile e con larghezza propria                |
| mobile  | nella **riga compatta sotto il nome prodotto**, senza rubare spazio |

**Il criterio è operativo.** La ricerca del banco lavora già per **barcode, SKU o nome
prodotto**: mostrare lo SKU sulla riga fa verificare a colpo d'occhio di aver preso la
**variante giusta** — che al banco, con taglie e colori, è l'errore più facile da fare.

⭐ **Non è una colonna da inventare**: `sku` esiste già come colonna condivisa nelle
configurazioni di riga (`goods-receipt-line-columns.config`,
`stock-movement-line-columns.config`) ed è già ordinabile nell'Ordine cliente. È un
altro pezzo che si monta, non si scrive.

### ⛔ Su MOBILE la battuta continua viene prima della forma — deciso il 19/08/2026

> **Da telefono deve essere pratico sparare EAN e inserire articoli in modo continuo e
> veloce.**

È il vincolo che governa la ricostruzione mobile, e va tenuto sopra l'eleganza della
maschera: al banco si scansiona **uno dietro l'altro**, spesso con una mano sola e il
cliente davanti.

⚠️ **È esattamente il rischio che il censimento del 19/08 aveva nominato**: i componenti
comuni sono pensati per un documento compilato **con calma**, e adottarli senza guardia
farebbe peggiorare proprio la cosa che al banco conta di più.

Quello che non deve succedere, in concreto:

| ⛔ Non deve                                                  | Perché                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| il campo di scansione perdere il fuoco dopo ogni articolo    | costringe a un tocco fra un capo e l'altro                  |
| la riga nuova rubare il fuoco per farsi compilare            | al banco i valori arrivano dall'anagrafica, non a mano      |
| l'elenco righe scorrere via dal campo di scansione           | il campo deve restare raggiungibile con la lista che cresce |
| un'apertura di pannello o una conferma fra un capo e l'altro | ogni interruzione si moltiplica per il numero di capi       |

**Il fuoco torna al campo di scansione dopo ogni inserimento riuscito**, e la conferma
resta il beep — che si sente senza guardare.

⚠️ **Da verificare a mano su un telefono vero prima di dire che la fase è chiusa**: è un
requisito di ergonomia, e nessun test automatico lo misura.

### ⛔ Poche colonne attive, e il COSTO non esiste — deciso il 19/08/2026

È un documento di **vendita al banco**: le colonne attive sono poche ed essenziali, quelle
elencate qui sopra.

> ⛔ **La colonna costo non va prevista, nemmeno disattivata.**

Non è «spenta per default»: **non deve esistere nel selettore colonne**. Una colonna
disattivata è una colonna che qualcuno accende, e il costo d'acquisto al banco non ha
ragione di comparire davanti a chi batte gli scontrini — spesso davanti al cliente.

⚠️ **Ne discende un vincolo per chi monta la tabella**: la configurazione colonne del
banco è **propria**, non ereditata da una maschera che il costo ce l'ha (Arrivo merce,
Ordine cliente). Ereditarla e poi spegnere il costo lo lascerebbe raggiungibile.

### ✅ FASE UI 1 e UI 2 — fatte il 19/08/2026

**UI 1 — i due comandi sull'elenco.** L'elenco è quello che **esisteva già** nell'area
Documenti: filtri, colonne, ricerca, export, stati e permessi restano i suoi, e include già
`list-page` — lo stesso impianto di cui il Registro Corrispettivi prende la sola parte
mobile. Non è stato importato nessun pattern nuovo: un ramo nel template e un campo
tipizzato `createVariantsLayout: 'menu' | 'buttons'` nella config.

⛔ **Non il menu «Nuovo» a tendina**: con due tipi i pulsanti dicono da soli cosa si può
creare. Le Fatture restano a menu, perché i tipi sono tre.

⚠️ **Il permesso è `retail.register`, non «gestisci documenti»**: le rotte di creazione
sono protette da `retailSalesRegisterGuard`, e senza questo controllo chi ha la gestione
documenti ma non il permesso di cassa avrebbe visto i pulsanti e sarebbe stato rimbalzato
in dashboard. Il gate usa la **stessa funzione** della guardia, non una condizione parallela.

### ⛔ UI 2 — il tipo lo decide la ROTTA, e la maschera non lo cambia

> **L'interruttore Vendita / Reso non esiste più.**

```text
/nuova-vendita-al-banco  →  mode = sale     non modificabile dalla maschera
/nuovo-reso-al-banco     →  mode = return   non modificabile dalla maschera
```

Era l'unica strada per trovarsi a compilare un **reso** su una pagina che dice «Nuova
vendita». Per cambiare tipo si cambia pagina, e le due sono a un clic dall'elenco.

Rimossi: il `role="tablist"` coi due `role="tab"`, il metodo `setMode` (unico chiamante
era quel blocco) e i quattro selettori SCSS rimasti suoi. Il signal è in **sola lettura**:
non esiste più un modo in cui la UI possa contraddire l'indirizzo.

⛔ **Le diramazioni funzionali restano tutte**: Vendita e Reso fanno cose opposte in
magazzino, e le nove condizioni su `mode()` leggono ora lo stesso valore, che viene dalla
rotta.

⚠️ **Un difetto trovato strada facendo.** Titolo e sottotestata erano **fissi sulla
vendita**: finché il tipo si cambiava da dentro non si notava, ma con due indirizzi
distinti aprire «Nuovo reso al banco» avrebbe mostrato «Vendita al banco» e una
sottotestata che dichiara lo **scarico** della giacenza — il contrario di quello che un
reso fa. Ora seguono il modo.

### ✅ Deciso il 19/08/2026 — la FASE UI 1 nasce senza «Elimina»

> **L'azione Elimina NON compare.** Non un pulsante disabilitato, non un comando che restituisce
> 409: semplicemente non c'è ancora.

⛔ **E non si inventa una cancellazione locale** per far quadrare l'elenco. La cancellazione
arriverà quando sarà **definito o riusato il comportamento comune di neutralizzazione**, che è
un contratto del dominio documenti e non una funzione di questa maschera.

⚠️ **Il caso che quel comportamento comune deve saper trattare**, e che va tenuto in vista
perché è quello che lo rende non banale:

> una **sorgente con un documento successivo** che **non aveva prodotto il proprio effetto
> fisico**.

Neutralizzare la prima senza sapere cosa ha fatto la seconda significa o lasciare in giro un
effetto che nessuno rivendica, o toglierne uno che non c'era mai stato. È la ragione per cui
`C 0` resta ⚠️ **parziale** e non si chiude di fretta.

**Perché il tecnico viene prima, e non è una preferenza di chi implementa.** Le rotte e l'elenco
non sono bloccati in sé. Ma il modulo va costruito **sulla base definitiva**: fare prima
un'interfaccia che espone documenti ancora trattati dall'API come `flow-only` — cioè non
modificabili e non eliminabili — significa costruire un elenco con azioni che l'API rifiuta, e
poi tornare sulle fondamenta.

### ⛔ C 0 non è una decisione da prendere: è un requisito già definito

**È in A2**, e non si riapre. Quello che manca prima di implementarlo è **il censimento tecnico
che A2 stessa richiede**: quale pattern comune VestiFlow usa per riconciliazione, modifica ed
eliminazione dopo che un documento ha già movimentato, e quale sia la **strada minima** che lo
riusa.

> **La domanda non è «facciamo C 0 oppure partiamo dalle rotte?».**
> **È «qual è il pattern tecnico corretto e minimo per implementare C 0 senza creare una logica
> locale?».**

Chiusa quella, si implementa C 0 e poi si entra nella costruzione dell'interfaccia.

⚠️ **Il netto/ivato NON è una prima fase autonoma**, e proporlo come tale era un errore di
criterio: lo si suggeriva perché è **piccolo e circoscritto**, non perché serva a costruire
qualcosa. Il suo selettore sta nella **testata della colonna Prezzo** (**A4**), quindi è **una
parte della costruzione della tabella righe** — arriva con la Fase UI 3, non prima.

> **Una fetta si sceglie per quello che sblocca, non per quanto è comoda.**

### Il piano di esecuzione — deciso il 18/08/2026

```text
C 0   implementare la riapertura/modifica/eliminazione seguendo il pattern comune
      già individuato (`syncUnloadLineMovements` e il gemello di carico),
      ⛔ senza logica locale
        · preservare in modifica: id delle righe, numero, data documento, snapshot storici
        · rendere Vendita e Reso riapribili e modificabili
        · eliminazione secondo A2: neutralizzazione integrale degli effetti PROPRI
        · test: riconciliazione per differenza · righe eliminate e aggiunte · idempotenza
                · Corrispettivi · venduto · tenant · Location

poi, in quest'ordine:

UI 1  elenco → [ Nuova vendita al banco ]  [ Nuovo reso al banco ]
UI 2  via il toggle interno: Vendita e Reso separati alla creazione
UI 3  la maschera, ricostruita sull'Ordine cliente e sui componenti comuni
```

### ⚠️ Il ramo Cassa del collega NON limita questo lavoro — deciso il 18/08/2026

Nel database condiviso esistono tabelle di quel ramo agganciate a `documents` con
`ON DELETE CASCADE` — pagamenti di cassa, ricevute fiscali — e una colonna di sessione di cassa
sui documenti. Nessuna di quelle migration è in questo ramo.

⛔ **Non si cambia A2 e non si introducono limitazioni alla Vendita al banco per adattarla a un
ramo vecchio che potrebbe essere dismesso.**

Il censimento e l'eventuale bonifica di quel ramo e delle sue migration sul database condiviso
sono un **lavoro separato e successivo**, registrato in `DA-FARE.md`. Non è una precondizione di
C 0.

| #   | Intervento                                                                                                                                                                                                          | Da                       | Perché                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | ⚠️ **PARZIALE** — **Rendere Vendita e Reso conclusi riapribili, modificabili ed eliminabili**, con riconciliazione per differenza e neutralizzazione in eliminazione                                                | A2 · B2                  | deciso il 18/08. È il divario più grande: oggi i due tipi sono in `FLOW_ONLY_DOCUMENT_TYPES` e i cinque percorsi generici li rifiutano ⚠️ **Manca l’eliminazione** — vedi il quadro sotto la tabella. |
| 0b  | ✅ **FATTO** 19/08/2026 — **Conservare numero, serie e data al risalvataggio**, e aggiungere il campo data al DTO del Reso                                                                                          | A2 · B5                  | oggi la creazione rinumera senza condizioni, e il DTO del Reso non ha `documentDate`: la data e sempre oggi Chiuso: il campo c’è, col pattern della Vendita.                                          |
| 1   | ✅ **FATTO** 18/08/2026, **ma incompleto** — completato il **20/08/2026**: 65 occorrenze residue in 35 file, sei delle quali esposte all'operatore. Ora c'è una guardia (`check:terminologia`)                      | A6 · B6                  | la rinomina precedente era incompleta e le due diciture convivevano. ⚠️ Un censimento a mano non chiude questo tipo di lavoro: vedi il quadro in **A6**                                               |
| 2   | Togliere il forcing netto/ivato e far entrare i due tipi nel contratto comune, memorie comprese                                                                                                                     | A4 · B3                  | oggi è una costante nel codice, non una convenzione                                                                                                                                                   |
| 3   | ✅ **FATTO** 19/08/2026 — Riallineare le rotte a `elenco → [Nuova vendita al banco] / [Nuovo reso al banco] → documento`, con i nomi fissati in A2, dopo il censimento dei consumer                                 | A2 · B2                  | grammatica diversa da tutti gli altri documenti, e il «Nuovo» a menu non è quello deciso                                                                                                              |
| 3b  | ✅ **FATTO** 19/08/2026 — **La riga dell'elenco apre la MODIFICA**, non l'anteprima: due rotte `:id/edit` e la maschera che carica per id (commit `0accf2f2`, riverificato nel codice il 20/08)                     | A2 · `regole-gestionale` | ⚠️ **si prevedeva che si chiudesse solo insieme alla FASE UI 3, e non è servito**: il caricamento per id è arrivato senza ristrutturare la maschera. La UI 3 resta aperta, alla voce **10**           |
| 4   | ✅ **FATTO** 19/08/2026 — Separare Vendita e Reso alla creazione, al posto dell'interruttore                                                                                                                        | A3 · B4                  | l'interruttore attuale non svuota nemmeno il carrello                                                                                                                                                 |
| 5   | ✅ **FATTO** 18/08/2026 — **Censire e rimuovere la logica di collegamento del Reso a una vendita origine** — percorso, campi, caricamento delle vendite recenti                                                     | A11 · B4                 | A11 stabilisce che il Reso **non ha** documento origine: quello che c'è oggi è legacy                                                                                                                 |
| 6   | ✅ **FATTO** — verificato nel codice il 20/08/2026: il percorso del Reso conserva lo snapshot (`preservedLineVat(previous?.id, …)`) e lo risolve dall'anagrafica solo sulla riga NUOVA                              | A11 · B4                 | senza snapshot la regola decisa diventa un'altra: un documento che si riscrive da solo. ⚠️ La prova che lo inchioda sta sul percorso GENERICO (`documents.service.spec.ts`), non su quello del Reso   |
| 7   | **Applicare** il contratto del Reso ora chiuso: causale **facoltativa** (oggi obbligatoria), prezzo dall'anagrafica, sconti come la Vendita, rimborso informativo, correzione come **A2**                           | A11 · B4                 | le cinque decisioni sono chiuse il 18/08: qui resta l'esecuzione, non la scelta                                                                                                                       |
| 8   | Portare il metodo di pagamento fino alla **riga del Registro**, al dettaglio della registrazione e all'export; poi valutare il filtro                                                                               | A8                       | oggi si ferma nella schermata della vendita                                                                                                                                                           |
| 8b  | ✅ **FATTO il 19/08/2026** — il Reso al banco entra nel Registro come rettifica negativa, una sola volta: quinta sorgente documentale, `kind: refund`, `refundKind: return_with_restock`. Contratto in **`10` §18** | A9 · A11                 | era misurato: il filtro era `type: store_sale` secco, e **nessun reso di cassa diminuiva l'incasso lordo**. Verificato sul database reale                                                             |
| 9   | Verificare e **preservare** il comportamento esistente: Origine esposta, Online/Fisico-POS come suoi raggruppamenti                                                                                                 | A9 · B10                 | **in buona parte già fatto**: resta una verifica, non un lavoro                                                                                                                                       |
| 10  | ⛔ **APERTA** (FASE UI 3) — Ristrutturare la schermata riusando l'Ordine cliente, senza forcare le aree di `03`                                                                                                     | A12 · B9                 | oggi non condivide nulla con la grammatica documentale                                                                                                                                                |
| 11  | Far valere la **regola comune** del solo effetto fisico lungo la catena                                                                                                                                             | A7 · B11                 | non un caso speciale per la accompagnatoria: il primo documento che registra il fatto movimenta, i successivi no                                                                                      |
| 12  | **Collegare** la Vendita al banco ai meccanismi Includi/Genera esistenti, estendendo il contratto delle coppie secondo la matrice di `12`                                                                           | A7 · B8                  | ⚠️ non è UN motore: la misura canonica (`12` §B) ne conta **sei parziali che non si conoscono**. Si dimensiona lì                                                                                     |

## C 3 — le cinque trappole del censimento _(19/08/2026)_

Otto piani, 198 ritrovamenti, 29 verifiche confermate su 30. ⛔ **Nessuna di queste dà un
errore**: sono i modi in cui una migrazione di URL fallisce in silenzio.

**1. `tenantWorkspaceGuard` è sul PADRE, non sulla rotta.** Cassa ed elenco lo ereditano da
`path: 'sales'` e `path: 'documents'` (`app.routes.ts:96` e `:84`). Un nuovo
`/app/vendita-al-banco` in cima ad `/app` **non eredita niente**: un operatore di
piattaforma entrerebbe nel gestionale di un cliente. È il più grave, ed è di sicurezza.

**2. I vecchi indirizzi non danno 404: vengono catturati.**

```text
/app/sales/register             → cade nel :id di sales-orders   → maschera Ordine cliente, id «register»
/app/documents/vendite-negozio  → cade nel :id di documents:525   → «Dettaglio documento», id inesistente
```

I redirect vanno dichiarati **prima** di quei catch-all. Il meccanismo esiste già in due
forme da imitare: `invoice-draft → fattura` (relativa, `pathMatch: 'full'`) e i due
`corrispettivi` (assoluta). ⚠️ Un `redirectTo` **senza** `pathMatch: 'full'` non trascina i
segmenti: `vendite-negozio/:id` vuole una riga sua.

**3. ⛔ `SectionDocuments` NON diventa `SectionSales`.** I gruppi di permesso dell'elenco
sono lo **specchio del gate di classe dell'API** (`documents.controller.ts`), che non cambia
con l'URL. Rinominare la rotta _invita_ a cambiare la sezione, e il risultato è una pagina
che si apre e poi fallisce ogni chiamata con **403**.

**4. I `data:` vanno trasportati identici, e i due non sono uguali.** L'elenco ha
`reuse: true`, il **dettaglio no**: uniformarli per simmetria cambia comportamento. E senza
`documentListProfile: 'store-sale'` il componente ricade su `'generic'` e mostra **il
registro generale col filtro Tipo** — non un errore, una pagina diversa che sembra funzionare.

**5. Il wildcard nasconde lo sbaglio.** `app.routes.ts:174` manda alla dashboard qualunque
URL non risolto: un mount scritto male non produce nessun sintomo, solo un rimbalzo.

### I confronti, che smettono di essere veri senza rumore

Evidenza in sidebar (`activeRoutePrefix`) · briciole · **ricerca globale ⌘K**, che non
confronta URL interi ma fa `startsWith` sulle radici di navigazione — spostare la voce
cambia _cosa la palette offre al cassiere_ · il gate `/app/documents` della palette · la
freccia «Indietro» dell'elenco, che **non ha `fallbackLink`** e deduce il padre dall'URL: da
`/app/vendita-al-banco` il padre non esiste e si finisce in Dashboard invece che nell'hub.

### Lo stato dei test, che è peggio di come sembrava

|                                         |                                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document-routing.util.spec.ts`         | ⭐ **l'unico che diventa rosso**: è il segnale di conferma della migrazione                                                                                                                                      |
| `e2e/permissions.spec.ts`               | ⛔ **già inerte OGGI** — cerca un link «Registra vendita», la sidebar dice «Vendita al banco»: prende il ramo `else` e passa da sempre. **Va sistemato prima**, o dopo sembrerà che le rotte nuove siano coperte |
| `nav-link-active.util.spec.ts`          | resta verde: costruisce un router finto proprio con `app/sales/register`                                                                                                                                         |
| `store-sale-register.component.spec.ts` | dà `provideRouter([])` senza `data`: col contratto **senza fallback** tutti i suoi test lanciano, e vanno aggiornati nello stesso passaggio                                                                      |

⛔ **Nessuno script di CI lega rotte e permessi**, né `listPath` a una rotta esistente. Sono
**due guardie da aggiungere con la migrazione**, non dopo: senza, config e rotte possono
divergere restando verdi.

### Cosa NON va toccato — verificato

`parent-route.util.ts` funziona già coi nomi nuovi · l'API non conosce queste rotte ·
`TableViewId.StoreSaleDocumentsList` è una chiave di preferenze colonne, non un URL.

⛔ E soprattutto: **`/online-sales/register/entries`** contiene la sottostringa
`sales/register` ma è un endpoint legacy **diverso**. Vive in `online-sales.service.ts` e in
`scripts/check-registro-legacy.mjs`. La migrazione si fa per **riferimenti esatti**, mai per
sottostringa.

---

⚠️ **Il 12 non si inizia prima dell'11**: una catena che si apre prima che la regola del solo
effetto fisico sia applicata è una catena che scarica due volte. Ora la tabella lo rispetta
anche nell'ordine, come dichiara di fare.

## ⚠️ C0 e C0b sono PARZIALI — cosa è fatto e cosa resta _(riallineato il 19/08/2026)_

⛔ **Il requisito non è stato ridotto per farlo coincidere col codice.** Restano quelli scritti
nelle due voci: qui si dichiara solo quanta parte è conclusa.

### C 0 — riapribili, modificabili ed eliminabili

| Requisito                               | Stato                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **riapribili**                          | ✅ `DocumentsService.getById` risponde su entrambi i tipi, **con gli id di riga** che servono a risalvare |
| **modificabili**                        | ✅ per `dto.id` su `POST /store-sales` e `/store-sales/returns`                                           |
| **riconciliazione per differenza**      | ✅ un movimento per riga, aggiornato in posto; nessuna rettifica accodata                                 |
| ⛔ **eliminabili**                      | ❌ **NON fatto**: `FLOW_ONLY_DOCUMENT_TYPES` contiene ancora `store_sale` e `store_return`                |
| ⛔ **neutralizzazione in eliminazione** | ❌ **NON fatto**, e non è una dimenticanza separata: non esiste l'eliminazione da neutralizzare           |

**Misurato, non dedotto.** `DocumentsService.delete` rifiuta con _«Le vendite e i resi negozio
non si eliminano: fanno parte dello storico movimenti»_ — provato su un Reso vero.

⚠️ **La modifica passa dal flusso dedicato, non dal percorso generico**, ed è la forma giusta: di
là si scavalcherebbe la riconciliazione della maschera.

✅ **Il messaggio è stato corretto il 19/08.** Diceva _«Vendite e resi negozio non sono
modificabili»_, che dopo **A2** è falso — si riaprono e si correggono. Ora dice **dove** si
modificano. ⛔ **Il gate non è stato toccato**: il percorso generico deve continuare a
rifiutarli, e cambiare la frase non cambia la regola.

⚠️ **La modifica è verificata a livelli diversi sui due tipi**: il **Reso** end-to-end sul
database reale, la **Vendita** dalle sole prove unitarie. Vale come fatto, ma la differenza va
saputa.

### C 0b — ✅ conservare numero, serie e data — CHIUSO il 19/08/2026

| Requisito                           | Stato                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| **conservare numero, serie e data** | ✅ verificato sul database reale al risalvataggio                              |
| **campo data nel DTO del Reso**     | ✅ `documentDate` aggiunto, **col pattern della Vendita riusato alla lettera** |

⛔ **Nessuna logica dedicata**, ed era la condizione posta: campo facoltativo `@IsISO8601`,
letto **solo alla creazione**, e in modifica si tiene quella persistita.

```ts
const documentDate = existing
  ? existing.documentDate
  : dto.documentDate
    ? new Date(dto.documentDate)
    : new Date();
```

⭐ **La data arriva anche al MOVIMENTO**, non solo al documento: senza, un rientro di luglio
comparirebbe nello storico movimenti in un giorno diverso da quello del suo documento.

**Verificato sul database reale** con un reso datato **15 luglio registrato il 19 agosto**:
documento, data di registrazione, movimento, riga del Registro e subtotale di giornata cadono
tutti sul 15 luglio, e **nessuno di essi compare fra le righe di oggi**. In modifica la data non
si sposta nemmeno mandandone un'altra.

---

# Metodo, prima di toccare il codice

1. Ispezionare il codice corrente prima di ogni fetta, e misurare invece di ricordare.
2. Censire i componenti dell'Ordine cliente realmente riusabili, distinguendo quelli
   stabilizzati da quelli che `03` sta muovendo.
3. Censire ricerca prodotto, barcode ed EAN condivisi, e la gestione del fuoco.
4. Verificare API, database, righe, quantità, movimenti, tenant e Location.
5. Verificare l'idempotenza di vendita e reso.
6. Non considerare il prototipo o l'HTML corrente come prova del comportamento.
7. Procedere per fette, con il rischio di regressione dichiarato ogni volta.

# Principio sintetico

> **La Vendita al banco deve sembrare un documento VestiFlow, ma deve potersi compilare alla
> velocità del banco.**
