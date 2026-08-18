# 11 · Vendita e Reso al banco — specifica funzionale

**Stato:** specifica corrente e **unica attiva** · aggiornata il 18/08/2026
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

| Aperta                                                                                                                                   | Dove    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| che cosa si può fare su una **vendita già conclusa** — modificarla, eliminarla                                                           | **A2**  |
| **prezzo** e **sconto** del reso                                                                                                         | **A11** |
| **causale** del reso: obbligatoria per scelta, o per caso                                                                                | **A11** |
| **rimborso**: informazione o collegamento futuro ai Pagamenti                                                                            | **A11** |
| **correggere un Reso già concluso**                                                                                                      | **A11** |
| **quali destinazioni** per la Vendita al banco nella mappatura documentale, e se debba essere anche sorgente o destinazione di _Includi_ | **A7**  |
| **riga manuale** senza articolo in anagrafica                                                                                            | **A21** |

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

## A2. Navigazione: elenco → Nuovo → documento

**Deciso il 18/08/2026.** La Vendita al banco segue la grammatica di tutti gli altri
documenti:

```text
Vendita al banco
  → elenco delle vendite
    → Nuovo
      → Nuova vendita   |   Nuovo reso
```

Non è una preferenza grafica: un ingresso diverso da tutti gli altri documenti costringe
l'operatore a imparare due grammatiche per la stessa cosa. La schermata operativa resta
rapidissima — cambia solo il percorso d'ingresso.

**I nomi tecnici delle rotte non si fissano qui.** Vanno prima censiti tutti i consumatori
delle rotte esistenti, poi riallineati alla convenzione già in uso, senza rompere link,
redirect o navigazione.

⏸️ **Aperto: che cosa si può fare su una vendita già conclusa.** Oggi il dettaglio è in sola
consultazione — non si modifica e non si elimina (**B2**) — ma è **un comportamento che si
osserva, non una decisione presa**. Modificare o eliminare una vendita conclusa tocca
movimenti già scritti e Corrispettivi già contati, quindi la risposta non è ovvia e va data
esplicitamente.

## A3. Vendita e Reso: due tasti separati alla creazione

**Deciso il 18/08/2026.** Nell'elenco ci sono **due tasti**, non un tasto «Nuovo» con un
selettore dentro:

```text
[ Nuova vendita ]   [ Nuovo reso ]
```

**Due tasti perché al banco un passaggio in meno conta**: un menu da aprire e una voce da
scegliere sono due gesti dove ne basta uno, e la fretta è la condizione normale di quella
schermata — non un caso limite. Vale **su desktop e su mobile**, con la stessa forma.

Scelto il tasto, la maschera è configurata per quel tipo. **Non** c'è un interruttore dentro
il documento che consenta di trasformare liberamente vendita → reso → vendita mentre si
compila.

**Il motivo è di dominio, non di ergonomia.** I due condividono l'impianto UI ma non il
comportamento:

|                      | effetto alla conclusione                                               |
| -------------------- | ---------------------------------------------------------------------- |
| **Vendita al banco** | scarico fisico · vendita economica positiva · pagamento                |
| **Reso al banco**    | rientro fisico · **rettifica** economica negativa · eventuale rimborso |

Una maschera che li scambia a metà compilazione nasconde questa differenza proprio dove
conta. Vedi **B4** per che cosa fa oggi l'interruttore esistente, e **A11** per il Reso.

## A4. Netto/ivato: la stessa logica di tutti gli altri documenti

**Deciso il 18/08/2026, dopo due formulazioni intermedie scartate** — prima «sempre ivati»,
poi una regola articolata con memoria e default propri. Entrambe sono ritirate.

Vendita e Reso al banco usano **il contratto comune** netto/ivato del gestionale. Nessuna
eccezione, nessun default dedicato, nessuna logica parallela, **nessun forcing «sempre
ivato»**.

- il selettore è disponibile in testata come negli altri documenti;
- la modalità iniziale segue la regola generale: memoria dell'operatore per il tipo, poi
  convenzione aziendale;
- la modalità scelta resta persistita nel documento e resta modificabile.

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

Ma **si classifica prima di rinominare**, perché i tre livelli hanno esiti diversi:

| Livello                                           | Esito                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **esposto all'operatore**                         | si rinomina in «Vendita al banco»                                                                                                    |
| **identificatore tecnico stabile o contrattuale** | **non** si rinomina per estetica: prima si valuta il rischio di migrazione e regressione                                             |
| **stringhe storiche già persistite**              | si censiscono prima di scegliere fra correggere la rappresentazione e migrare i dati. Nessun backfill di massa senza un motivo reale |

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

### La mappatura che esiste oggi — recuperata dal progetto, non ricostruita

Misurata il 18/08/2026. Serve perché la decisione qui sopra dice **dove si deve arrivare**, e
questa dice **da dove si parte**.

| **Includi** — chi può includere cosa |                                      |
| ------------------------------------ | ------------------------------------ |
| Ordine cliente                       | ← Preventivo                         |
| DDT vendita                          | ← Preventivo · Ordine cliente        |
| Arrivo merce                         | ← Ordine fornitore (solo confermati) |
| Preventivo                           | ← niente: si crea sempre da zero     |

| **Genera** — chi può generare cosa |                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Proforma                           | → DDT vendita · Bozza fattura                                                           |
| DDT vendita                        | → Bozza fattura · Proforma                                                              |
| ogni altro tipo                    | ⛔ rifiutato: «solo proforme e DDT vendita possono essere convertiti con questa azione» |

⚠️ **La Vendita al banco non compare in nessuna delle due, in nessuna direzione.** E la
**Fattura accompagnatoria non è destinazione di nessuno**: oggi non la genera nessun tipo.

⏸️ **Quindi la decisione richiede di ESTENDERE la mappatura, e come non è stabilito.** Da
verificare con chi governa il sistema documentale, non da decidere qui: quali destinazioni
esatte per la Vendita al banco, e se debba essere anche sorgente o destinazione di _Includi_
oltre che di _Genera_.

### Un solo effetto fisico per una sola uscita — regola comune, non eccezione locale

> **Il primo documento che registra realmente l'effetto fisico movimenta; i documenti
> successivi collegati non duplicano quell'effetto.**

```text
Vendita al banco conclusa        → scarico fisico già avvenuto
Vendita al banco → Fattura       → nessun nuovo scarico per la stessa uscita
Vendita al banco → Fattura acc.  → nessun secondo scarico per la stessa uscita
```

⛔ **Non si costruisce un trattamento speciale basato sul nome del documento.** Una Fattura
accompagnatoria generata da una Vendita al banco che ha già prodotto lo scarico **non deve
produrre un secondo movimento per la stessa merce** — e questo perché vale la regola comune,
non perché si scriva un caso particolare per la accompagnatoria.

_(Cosa faccia oggi la Fattura accompagnatoria quando è lei il primo documento fisico è
misurato in **B11**. È un fatto, non la fonte di questa regola.)_

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

**Deciso il 18/08/2026.** All'operatore non si mostra la parola «Ambito», che non dice niente.
Ma **non nasce una dimensione nuova al suo posto**: Online e Fisico/POS diventano
**raggruppamenti dentro Origine**.

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

⚠️ **Cambia il nome, non il comportamento.** Chi legge «Ambito non deve più comparire» e
cancella il filtro ha tolto una funzione, non un'etichetta: le due domande — da dove nasce
la vendita, e se è online o fisica — restano entrambe.

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

⚠️ **Che oggi sia così NON è stato verificato**, ed è in **C5**. Senza lo snapshot la regola
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
  → effetto economico  −50 €
  → movimento fisico   +1
```

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

### Cosa resta davvero aperto

| Domanda                                                                                                                                         | Stato                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **prezzo del reso**: proposto dal prezzo corrente dell'articolo, digitato liberamente, ripreso da un riferimento quando c'è, o una combinazione | **da decidere** — e non si assume nulla finché non si guarda come si comporta la maschera oggi |
| sconto da usare                                                                                                                                 | **da decidere**                                                                                |
| **causale obbligatoria**: oggi il codice la pretende, ma è una regola che nessuno ha preso                                                      | **da decidere** — confermarla o toglierla, non lasciarla accadere                              |
| rimborso: informazione semplice o collegamento futuro ai Pagamenti                                                                              | **da decidere**                                                                                |
| **correggere un Reso già concluso**: cosa succede al movimento e alla riga di Registro                                                          | **da decidere**, ed è la parte che pesa: sono movimenti già scritti e valori già contati       |

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

### Direzione trasversale, da annotare e non da implementare qui

Nei documenti che usano la spunta di riga servirà anche un **comando a livello documento** che
la attivi o disattivi **in blocco su tutte le righe**: con molte righe non è accettabile
obbligare l'operatore a toccarla articolo per articolo.

⚠️ È un **requisito trasversale dei documenti**, non una logica inventariale della Vendita al
banco. Sta scritto qui perché è emerso qui, non perché appartenga a questo modulo.

## A12. Interfaccia: si parte da Ordine cliente, senza ereditarne il dominio

**Deciso il 18/08/2026, e la formulazione precedente era troppo vaga.** Non «stessa famiglia
visiva»: **Ordine cliente è l'implementazione concreta di riferimento da cui partire.**

```text
NO   guardo Ordine cliente → progetto una nuova schermata simile
SÌ   ispeziono Ordine cliente → individuo i pezzi già risolti → li riuso o li estraggo
     → costruisco la Vendita al banco sopra quella base
```

- struttura, testata, tabella e piede: fonte concreta è l'Ordine cliente **desktop**;
- card e comportamento responsive: fonte concreta è l'Ordine cliente **mobile**;
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
selettore **netto/ivato** (A4), e il numero secondo il sistema comune (A5).

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

Desktop: tabella con la densità dell'Ordine cliente, senza le informazioni che alla Vendita al
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

**Di riga:** modificabile direttamente, secondo il contratto sconti comune.

**Extra a piè documento:** la UI prevede **sia percentuale sia importo**. Il calcolo lo fa il
motore economico comune, mai una logica ad hoc.

Da definire nel blocco Sconti: se percentuale e importo sono cumulabili o alternativi, ordine
di applicazione, arrotondamenti, comportamento con più aliquote, rapporto con castelletto e
totali. **Più aliquote non sono un motivo per togliere l'importo:** vanno gestite nel modello
economico.

## A17. Riepilogo e conclusione

Piede come gli altri documenti, con le sole informazioni necessarie: totali dal motore
economico comune, sconto extra, IVA, totale, pagamento informativo, azione finale. Il totale
dev'essere chiaramente leggibile.

L'azione principale dice **«Concludi vendita»** o **«Concludi reso»**, e il suo significato
dev'essere inequivocabile: è il momento in cui nasce l'effetto fisico ed economico.

## A18. Stock e movimenti

**Scansione, ricerca, aggiunta e modifica non creano movimenti.** Lo scarico avviene solo alla
conclusione.

Alla conclusione della **vendita**: una riga movimentabile → un movimento negativo, collegato a
documento e riga con identità stabile, tenant e Location rispettati, retry e doppio clic
idempotenti, e nessun secondo scarico generato da Corrispettivi o report.

Alla conclusione del **reso**: la quantità realmente rientrata genera il movimento di rientro,
collegato a documento e riga; retry e doppio clic non duplicano il carico; l'effetto economico
è una **rettifica**, non una vendita positiva.

**Stock insufficiente:** la vendita oltre la disponibilità è consentita. Warning visibile, **non
bloccante**; Giacenza e Disponibile possono diventare negative.

## A19. Fuoco e tastiera

È un requisito funzionale, non una rifinitura. Va verificato dopo: scansione riuscita,
selezione da ricerca, modifica di quantità, prezzo, sconto e nome, eliminazione riga,
salvataggi e aggiornamenti asincroni, EAN non trovato.

L'operatore non deve riposizionare il cursore per continuare una sequenza di scansioni.

## A20. Aspetto visivo

Colori, token, componenti e regole visive sono quelli già definiti per VestiFlow: questa
specifica **non introduce una palette autonoma**. Per densità e spaziatura il riferimento è
l'Ordine cliente.

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
si modificano né si eliminano da qui». **Resta un comportamento osservato**: che sia anche la
regola giusta non lo ha deciso nessuno, ed è aperto in **A2**.

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

⛔ **Entrando in modalità reso il codice carica le vendite recenti.** Serve al collegamento
dell'origine, che **A11** ha escluso dal contratto: va **censito e presumibilmente rimosso** se
non ha altro scopo.
reso carica le vendite recenti; tornando a vendita rimette il fuoco sulla ricerca. **Non
svuota il carrello** — mentre il cambio di Location lo svuota, e il codice spiega perché. I due
percorsi usano stati diversi, quindi il carrello resta lì mentre si compila un reso.

**Percorso reso, misurato:**

| Aspetto                   | Comportamento oggi                                               | Rispetto ad A11                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collegamento alla vendita | **facoltativo**; se indicato, è validato                         | ⛔ **da riallineare**: A11 stabilisce che il Reso **non ha** documento origine. Questo percorso è legacy, non il contratto                                                      |
| tetto sulla quantità      | **nessuno**                                                      | ✅ non è più materia: **l'origine esce dal contratto**, quindi non c'è nulla da cui derivare un tetto                                                                           |
| IVA                       | **non quella incassata**: prende quella corrente dell'articolo   | ◐ **coincide solo in parte**: A11 conferma la fonte, ma pretende lo **snapshot di riga**, e che oggi ci sia **non è verificato** (C5)                                           |
| prezzo                    | dalla riga, con l'intento dichiarato di rendere quanto incassato | ⏸️ **aperto** (A11): la fonte del prezzo non è decisa                                                                                                                           |
| causale                   | **obbligatoria**                                                 | ⏸️ **nessuno l'ha decisa**: portata in A11 fra le aperte                                                                                                                        |
| movimento                 | nasce solo per le righe con la spunta di carico attiva           | ✅ è la logica documentale comune (**A11-ter**) — ⛔ ma la distinzione «vendibile / non vendibile» con cui il codice la pilota è **legacy e non pertinente** al contratto nuovo |
| numerazione               | sistema canonico comune, prefisso dalle impostazioni             | **già conforme ad A5**                                                                                                                                                          |

## B11. La Fattura accompagnatoria scarica alla conferma

Misurato: la funzione che decide se un tipo scarica il magazzino alla conferma risponde **sì**
per la Fattura accompagnatoria, e c'è un test che lo inchioda.

⚠️ **È un fatto, non la fonte della regola.** La regola di **A7** — un solo effetto fisico per
una sola uscita — vale per il sistema documentale comune, e questa misura dice soltanto che
quando la accompagnatoria è **il primo** documento fisico il suo scarico è quello giusto. Il
caso da governare è quando **non** è il primo.

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

## B8. Con le Fatture non esiste nessuna relazione

La relazione strutturata che lega Fattura e DDT vendita **non copre** la Vendita al banco, e le
azioni di inclusione e conversione non la contemplano fra le origini. Il piano A7 non descrive
quindi una catena da correggere: descrive una catena **da disegnare**.

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

---

# C · INTERVENTI CONSEGUENTI

In ordine di dipendenza, non di importanza. Ogni voce nasce da A confrontato con B.

| #   | Intervento                                                                                                                                                                               | Da       | Perché                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Censire la terminologia legacy e correggere l'etichetta esposta rimasta indietro                                                                                                         | A6 · B6  | la rinomina precedente è incompleta e le due diciture convivono                                                  |
| 2   | Togliere il forcing netto/ivato e far entrare i due tipi nel contratto comune, memorie comprese                                                                                          | A4 · B3  | oggi è una costante nel codice, non una convenzione                                                              |
| 3   | Riallineare le rotte a elenco → Nuovo → documento, dopo il censimento dei consumatori                                                                                                    | A2 · B2  | grammatica diversa da tutti gli altri documenti                                                                  |
| 4   | Separare Vendita e Reso alla creazione, al posto dell'interruttore                                                                                                                       | A3 · B4  | l'interruttore attuale non svuota nemmeno il carrello                                                            |
| 5   | **Censire e rimuovere la logica di collegamento del Reso a una vendita origine** — percorso, campi, caricamento delle vendite recenti                                                    | A11 · B4 | A11 stabilisce che il Reso **non ha** documento origine: quello che c'è oggi è legacy                            |
| 6   | Verificare che l'IVA del Reso sia scritta come **snapshot di riga** e non riletta dall'anagrafica                                                                                        | A11 · B4 | senza snapshot la regola decisa diventa un'altra: un documento che si riscrive da solo                           |
| 7   | Chiudere le decisioni aperte del Reso: **prezzo, sconto, causale, rimborso, correzione di un Reso concluso**                                                                             | A11      | il nucleo è deciso, queste cinque no — e la correzione è la più pesante                                          |
| 8   | Portare il metodo di pagamento fino alla **riga del Registro**, al dettaglio della registrazione e all'export; poi valutare il filtro                                                    | A8       | oggi si ferma nella schermata della vendita                                                                      |
| 9   | Verificare che «Ambito» non compaia più, e che i raggruppamenti stiano dentro Origine                                                                                                    | A9 · B10 | **in buona parte già fatto**: resta una verifica, non un lavoro                                                  |
| 10  | Ristrutturare la schermata riusando l'Ordine cliente, senza forcare le aree di `03`                                                                                                      | A12 · B9 | oggi non condivide nulla con la grammatica documentale                                                           |
| 11  | Censire e applicare **sia «Includi documento» sia «Genera documento»** per la Vendita al banco, secondo la mappatura documentale comune — che oggi non la contempla in nessuna direzione | A7 · B8  | sono due operazioni distinte, e la mappatura va **estesa**, non aggirata                                         |
| 12  | Far valere la **regola comune** del solo effetto fisico lungo la catena                                                                                                                  | A7 · B11 | non un caso speciale per la accompagnatoria: il primo documento che registra il fatto movimenta, i successivi no |

⚠️ **L'11 non si inizia prima del 12**: una catena che si apre prima che la regola del solo effetto fisico sia applicata è una catena che scarica due volte.

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
