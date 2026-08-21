# 12 · Collegamenti fra documenti — «Includi» e «Genera»

**Stato:** specifica corrente · **18/08/2026**
**Perimetro:** tutti i tipi documento, non una famiglia sola.

> **Come i documenti si agganciano fra loro, e che cosa succede al magazzino quando lo fanno.**

⚠️ **Il documento ha due parti, e vanno tenute distinte.** Sopra sta la SPECIFICA — la matrice e
le regole, cioè cosa VestiFlow deve fare. In fondo sta **«B · Come ragiona il codice OGGI»**, che
è la MISURA di cosa il codice fa: il divario fra le due è il lavoro, e un comportamento osservato
non diventa una regola perché esiste.

⚠️ **Questo contenuto stava dentro `07-specifica-famiglia-fattura.md` come §11.** Ci stava
perché è nato lì, il 15/08, quando la matrice copriva quattro documenti della famiglia
fattura. Il 18/08 è stata completata su **tutti** i tipi — Preventivo, Ordine cliente, DDT,
Vendita al banco, Fattura, Accompagnatoria, Nota di credito — e a quel punto vivere dentro la
specifica delle fatture era un problema di navigazione: chi cerca «come si aggancia un
Preventivo a un Ordine» non lo cercherebbe mai lì.

**In `07` non ne resta una copia**, solo il rimando: la tabella ha una casa sola.

---

## Le due operazioni, che non sono sinonimi

|               |                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| **Includere** | tiro dentro qualcosa che **esiste già**: fonde righe da N documenti, **non** valorizza `sourceDocumentId` |
| **Generare**  | da un documento aperto **ne creo un altro**: predecessore diretto, origine persistita                     |

Sono due famiglie di meccanismo, non due parole per la stessa cosa. Danea le tiene distinte
anche a schermo, con due pulsanti separati a piè di documento.

---

## Includi documento — un elenco filtrato, non una catena

**Deciso 15/08.**

⚠️ **Correzione a materiale precedente.** Le verifiche del 14/08 scrivono «catena attesa:
Ordine cliente → DDT → Fattura» come se il percorso fosse cablato. **Non lo è.** Il documento
non nasce dal suo predecessore designato: l'operatore apre un documento e sceglie cosa
includerci, col pulsante «Includi documento». Chi implementa leggendo «catena attesa»
costruisce un binario dove serve un elenco.

### I tre filtri

Ciò che compare in «Includi documento» è determinato, nell'ordine:

1. **Cliente** — solo i documenti di quel cliente. Finché il cliente non è scelto non c'è nulla da includere.
2. **Tipo** — solo i tipi che stanno a monte (tabella sotto).
3. **Stato** — solo i documenti non ancora consumati.

### La testata: due contesti, due comportamenti — deciso il 18/08/2026

⚠️ **Non è una regola sola con un'eccezione. Sono due operazioni diverse**, ed è la distinzione
che questa specifica fa fin dalla prima riga: includere tira dentro qualcosa dentro un documento
che **esiste già**; generare fa **nascere** un documento nuovo.

| Operazione                                   | Il cliente                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Includi**, su un documento già aperto      | resta **invariato**. ⛔ Una sorgente con cliente diverso **non può essere applicata** |
| **Genera**, verso un documento nuovo e vuoto | il nuovo documento **eredita** il cliente della sorgente — ed è corretto che sia così |

```text
DDT del cliente Rossi, già aperto
  → Includi → mostra solo documenti compatibili DI ROSSI
            → la testata non cambia mai

Ordine cliente di Rossi
  → Genera DDT → nasce un DDT nuovo, intestato a ROSSI
```

⛔ **«Non cambia la testata» è più debole di quello che serve, e non basta.** La regola è che una
sorgente di un altro cliente **non si applica affatto**: con il filtro attivo non compare
nell'elenco, e per le vie che non passano dall'elenco va rifiutata.

### ⚠️ Che oggi i due contesti condividano una funzione NON li rende una regola sola

**Misurato:** il parametro di rotta `?includeOrder=<id>` — che è il precompilato di **«Genera
documento» dall'Ordine cliente** — apre un DDT nuovo e vuoto e chiama
`onDocumentIncluded(...)`, cioè **la funzione dell'inclusione**
(`customer-order-form.component.ts:1935-1946`). — _letto_

Da lì viene l'ereditarietà del cliente che nel pannello è un difetto e in quel percorso è
giusta: **è lo stesso codice usato per due operazioni diverse.**

⛔ **Questo è un difetto di implementazione, non un vincolo di dominio, e non va promosso a
regola.** Una regola unica del tipo «eredita solo se il campo è vuoto» farebbe funzionare
entrambi i percorsi **per coincidenza** — perché nel pannello la testata è sempre piena e in
Genera è sempre vuota — e nasconderebbe che le due operazioni hanno contratti diversi. Il primo
percorso che rompesse quella coincidenza romperebbe la regola.

### L'ordine dei due interventi — deciso il 18/08/2026

```text
1º  separare i due comportamenti nel percorso comune,
    coprendo anche le vie che NON passano dal pannello
2º  aggiungere al pannello il filtro per customerId,
    così scelto il tipo si vedono solo i documenti di quel cliente
```

**Il primo prima**, e non è una preferenza: il filtro sta sul **pannello**, e la via
`?includeOrder` lo scavalca. Finché i due contesti non sono separati, una correzione fatta solo
sull'elenco lascia scoperta la strada che non ci passa.

### ⏸️ Le condizioni di pagamento non seguono automaticamente — censite il 18/08/2026

⛔ **La decisione sul cliente NON si estende a loro.** Che il cliente si erediti in Genera e non
in Includi non dice niente su come debbano comportarsi le condizioni di pagamento: è una
decisione separata, e **non è presa**. Qui c'è solo la misura.

#### Tre regole diverse per la stessa grandezza, e convivono nello stesso file

| Da dove arriva                                | Regola oggi                                                | Dove                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **anagrafica cliente**, scegliendo il cliente | eredita **solo se il campo è vuoto**                       | `sales-document-form.component.ts:1188-1190` · `customer-order-form.component.ts:4068-4069`                          |
| **inclusione** di un documento                | **sovrascrive sempre**                                     | `customer-order-form.component.ts:3937-3939`                                                                         |
| **generazione** (precompilato)                | **sovrascrive sempre**, ma su documento nuovo quindi vuoto | `documents.service.ts:2535` · `sales-document-form.component.ts:2613` · `customer-order-form.component.ts:1983-1984` |

— _letto_

⚠️ **La regola «solo se vuoto» esiste quindi già nel progetto**, ed è quella dell'anagrafica.
L'inclusione è l'unico dei tre percorsi che scrive sopra un valore già messo dall'operatore.

#### Due cose da sapere prima di decidere

**1. È testo libero, non un riferimento.** `paymentTerms` è `String?` su tutte e quattro le
tabelle che ce l'hanno — `Supplier` (`schema.prisma:998`), `Customer` (`:1175`), `SalesOrder`
(`:1298`), `Document` (`:2098`). Non è una chiave verso `PaymentOption`: quindi «compatibile» e
«diverso» qui si possono confrontare solo come stringhe. — _letto_

**2. L'elenco configurato lo legge una maschera sola.** `PaymentOption` è consultato
dall'Ordine cliente (`customer-order-form.component.ts:704-706`) e **non** dalla maschera
Proforma/Fattura/Accompagnatoria, che non lo importa affatto. Le due maschere offrono quindi lo
stesso campo con due gradi di assistenza diversi. — _letto_

#### Cosa resta da decidere

- se in **Includi** le condizioni di pagamento debbano restare quelle del documento corrente
  (come il cliente), o continuare ad arrivare dalla sorgente;
- se in **Genera** debbano ereditarsi dalla sorgente o rileggersi dall'anagrafica del cliente —
  che è una domanda vera, perché le condizioni possono essere cambiate dopo;
- se l'elenco `PaymentOption` debba valere per **tutte** le maschere documentali.

## La matrice — chiusa, nessuna riga dedotta

**Le due direzioni stanno sulla stessa riga**, perché è così che si legge: aprendo un
documento, che cosa posso tirarci dentro e che cosa posso farne nascere.

| Documento corrente          | Includi documento                                                | Genera / azione verso il documento successivo                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preventivo**              | —                                                                | Ordine cliente · Proforma · DDT vendita · **Vendita al banco** · Fattura accompagnatoria · Fattura                                                                                                                                                 |
| **Ordine cliente**          | Preventivo                                                       | Proforma · DDT vendita · **Vendita al banco** · Fattura accompagnatoria · eventuale Fattura dove il percorso previsto la rende documento di evasione — ⏸️ **quali di queste chiudano l'ordine è una proposta**, vedi «Conclusivo e non conclusivo» |
| **DDT vendita**             | Preventivo · Ordine cliente                                      | **Vendita al banco** · Fattura — e oggi VestiFlow genera **già** verso Fattura e Proforma                                                                                                                                                          |
| **Vendita al banco**        | Preventivo · Ordine cliente · DDT vendita                        | **Fattura · Fattura accompagnatoria**                                                                                                                                                                                                              |
| **Fattura**                 | Preventivo · Ordine cliente · DDT vendita · **Vendita al banco** | Nota di credito                                                                                                                                                                                                                                    |
| **Fattura accompagnatoria** | Preventivo · Ordine cliente · **Vendita al banco** — **mai DDT** | Nota di credito                                                                                                                                                                                                                                    |
| **Nota di credito**         | **non usa** «Includi documento»                                  | —                                                                                                                                                                                                                                                  |
| **Proforma**                | **niente**: non ha sorgenti includibili                          | **DDT vendita · Fattura**                                                                                                                                                                                                                          |

### ⛔ Due righe che NON vanno aggiunte — ritirate il 18/08/2026

Non sono un'omissione da completare, e la simmetria fra i tipi non è un argomento:

```text
⛔ Vendita al banco → Genera → Reso al banco
⛔ Reso al banco    → Includi → Vendita al banco
```

**Il Reso al banco non ha documento origine**, perché la vendita reale può essere stata battuta
su una cassa esterna e non essere mai esistita in VestiFlow (`docs/11` A11). Aggiungere una
delle due riaprirebbe dalla porta di servizio il collegamento che il contratto esclude dalla
porta principale.

### Che cosa di questa tabella è già approvato, e che cosa no

Serve o fra sei mesi la differenza non si vede più.

| Parte                                                                                        | Stato                                                                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| colonna **Includi** per Ordine cliente · DDT · Fattura · Accompagnatoria, «mai DDT» compresa | **decisa 15/08**                                                                    |
| **Fattura → Nota di credito** e **Accompagnatoria → Nota di credito**                        | **deciso 16/08**, con la tabella per tipo in `07` §6                                |
| la **Vendita al banco** in entrambe le colonne                                               | **deciso 18/08**                                                                    |
| tutto il resto della colonna **Genera**                                                      | **nuovo, deciso il 18/08** — non era mai stato scritto                              |
| **Proforma**                                                                                 | ✅ **censita il 21/08/2026**: non include nulla, genera verso DDT vendita e Fattura |

### ⚠️ «Bozza fattura» non è un tipo documentale

Nella specifica e nella matrice esistono **due nomi soli**: **Fattura** e **Proforma**.

`invoice_draft` è il nome tecnico storico, ma all'operatore quel documento **è la Fattura** —
lo dicono le etichette e il titolo di stampa. **«Bozza fattura» non è il nome di niente**, ed
è filtrato in almeno un messaggio d'errore dell'API: _«si possono generare solo Bozza fattura
o Proforma»_.

⛔ **Qualunque testo di API o interfaccia che esponga ancora «Bozza fattura» è terminologia
legacy da censire**, non un tipo documentale da mettere in matrice.

⚠️ **E va tenuto distinto da ciò che il codice fa oggi**, che è molto meno: la conversione
ammette **due sole origini**, Proforma e DDT vendita, verso Fattura e Proforma. Quel
comportamento **non si cancella** per far posto alla matrice — è già in uso, e la matrice dice
dove si deve arrivare, non che l'esistente sia sbagliato.

⚠️ **Una coincidenza da nominare, perché cambia il lavoro: `DDT → Fattura` esiste già.** La
relazione è **nuova come decisione** (la colonna Genera è del 18/08) e **già implementata**
come comportamento. Sono due cose diverse anche quando coincidono — e la conseguenza pratica
è che quella riga **non va presentata come funzione da costruire**: c'è.

Vale anche per `Proforma → DDT vendita` e `Proforma → Fattura`, che è ciò che rende utile il
censimento della riga Proforma invece di riscriverla da zero.

### Perché «mai DDT» sull'accompagnatoria, e perché la Vendita al banco non lo viola

L'accompagnatoria **sostituisce** il DDT nella stessa uscita: includerne uno sarebbe la stessa
contraddizione di una Fattura dentro un DDT.

⚠️ **La Vendita al banco non viola quel principio.** Può aver già realizzato l'uscita, e
**l'accompagnatoria non produce un proprio movimento di scarico quando lo stesso effetto fisico
è già stato registrato dal documento precedente.** È la regola fisica qui sotto, non
un'eccezione per questo tipo.

### La Nota di credito sta fuori dal normale «Includi»

Non include nulla. Nasce vuota dal menù «Nuovo», oppure viene **generata** da una Fattura o da
un'accompagnatoria. Sono due gesti diversi e non vanno confusi.

**Cardinalità: molti-a-uno.** In una fattura si possono includere più DDT.

### Il comando si chiama «Genera documento» OVUNQUE — deciso il 18/08/2026

> **Un solo nome per un solo gesto: da questo documento ne nasce un altro.**

⚠️ **Attenzione a dove finisce il deciso.** In questa sezione **una sola cosa è una decisione
del proprietario**: il nome unico del comando. Tutto ciò che segue — il vincolo sul motore, le
coppie con i loro effetti, il menu a due gruppi — è **materiale di discussione non ancora
confermato**, ed è marcato ⏸️ voce per voce. Non è pignoleria: la prima stesura lo aveva
scritto come deciso, e una proposta promossa a regola non si distingue più da una regola.

⚠️ **Qui c'era «Concludi ordine» come comando distinto dell'Ordine cliente. Ritirato**, su
decisione del proprietario: due parole per lo stesso gesto confondono chi lavora e chi
compra. L'operatore impara un comando e lo ritrova in ogni documento.

**E c'è una ragione più forte della coerenza.** Con due comandi distinti, prima o poi qualcuno
aggiunge un «Genera documento» **generico** anche all'Ordine cliente — e quello copierebbe le
righe **senza consumare l'Impegnata**. Due nomi sono due strade, e quella sbagliata non
segnala niente: l'ordine resta impegnato per sempre e il Disponibile è falso.

### ⛔ Due nomi soli: «Includi» e «Genera» — vale per TUTTI i tipi

La terminologia della matrice documentale è **soltanto** questa.

⛔ **Non si introducono categorie parallele** — `Converti`, `Concludi`, `Deriva` e simili. Se
una schermata usa un'etichetta particolare, quella resta **un'etichetta**: non genera un motore
funzionale distinto.

⚠️ **La regola viveva in `docs/11`**, cioè nel file di un modulo, e da lì la Vendita al banco
doveva difendere il proprio «Concludi vendita» da una regola che ospitava lei stessa. Chi lavora
sulla matrice senza aprire `11` non la incontrava. Spostata qui il 18/08/2026.

⚠️ **Un'azione interna di un documento non è una categoria della matrice.** «Concludi vendita»
chiude un documento e ne produce gli effetti: vive su un piano diverso, e le due cose non vanno
uniformate.

### ⛔ Il vincolo non è sul nome: è sul CONTRATTO DELLA COPPIA

> **Il comportamento non deve dipendere dal pulsante, ma dalla coppia documento origine →
> documento destinazione.**

**Confermato dal proprietario il 18/08/2026**, in parole sue:

> «Non è il nome _Concludi ordine_ a proteggere l'impegno. Deve essere il contratto della
> relazione origine→destinazione. Questo è il vero punto architetturale da mantenere.»

Quindi il nome del comando non porta nessuna garanzia: la porta **la coppia**.

⚠️ **Rinominare non basta, ed è il punto che va letto due volte.** Il motore va costruito in
modo che **non esista un percorso generico che si limiti a copiare righe**. Il consumo
dell'Impegnata dev'essere una **conseguenza obbligatoria** della relazione origine →
destinazione quando quella relazione è conclusiva — non un ramo che qualcuno ha ricordato di
scrivere.

⛔ **Senza questo vincolo, fra un anno qualcuno crea un secondo endpoint `generate` che salta
la logica**, e non se ne accorge nessuno: le righe si copiano, il documento nasce, e
l'ordine resta impegnato per sempre. È lo stesso difetto dei due comandi, ricomparso un
livello più sotto.

### Cosa vuol dire, coppia per coppia

**Confermate dal proprietario** — le due che ha scritto lui:

```text
Ordine cliente → Proforma       →  NON consuma l'Impegnata
Ordine cliente → DDT vendita    →  consuma l'Impegnata e realizza l'evasione
```

⏸️ **NON confermate** — vengono dal materiale di discussione, e stanno qui per essere decise:

```text
Ordine cliente → Vendita al banco         →  «idem: se la destinazione è conclusiva,
                                             l'impegno diventa effetto reale»
Ordine cliente → Fattura accompagnatoria  →  «idem, secondo il contratto della destinazione»
```

⏸️ **E resta fuori una domanda che era nascosta dentro una di queste righe: la CHIUSURA
PARZIALE.** Il materiale di discussione diceva «conclude **per le quantità evase**», cioè che
un ordine evaso a metà **resta aperto per il residuo**. Non è un dettaglio di questa tabella:
è un pezzo di dominio a sé — quanto impegno si consuma, che stato prende l'ordine, se il
residuo si evade con un secondo documento, cosa mostra l'elenco. **Non decisa.**

⚠️ **E «idem» non è una regola.** Le due righe non confermate rimandano a un contratto che per
quelle destinazioni non è ancora scritto.

### Sparisce il nome, NON il comportamento

L'Ordine cliente ha una cosa che gli altri non hanno: **l'Impegnata**. Generare da un ordine un
documento che realizza davvero l'uscita **deve trasformare l'impegno in uscita reale** — non
limitarsi a travasare righe. Questo vale esattamente come prima: è **l'effetto**, e l'effetto
lo decide la coppia origine → destinazione, non il nome del pulsante.

È lo stesso principio della regola fisica qui sotto: **il comando è uno, gli effetti li deriva
il dominio dalla coppia di documenti.**

### ⏸️ Conclusivo e non conclusivo — PROPOSTA

⏸️ **Non confermata.** Che alcune destinazioni chiudano l'ordine e altre no è **plausibile e
probabilmente vero**, ma quali e con che effetto discende dalle coppie qui sopra, che sono
anch'esse una proposta.

```text
Ordine cliente → Proforma                   →  l'ordine resta APERTO
Ordine cliente → DDT vendita                →  l'ordine si CHIUDE, l'impegno si consuma
Ordine cliente → Vendita al banco           →  idem
Ordine cliente → Fattura accompagnatoria    →  idem
```

**Quello che invece è un fatto**, e non dipende da come si decide: con un comando solo
l'operatore **non ha più il nome del pulsante** a dirgli se sta chiudendo l'ordine. Se la
distinzione esiste, in qualche modo deve vedersi. Come, è la sezione qui sotto.

### ⏸️ Come si mostra all'operatore — PROPOSTA

⏸️ **Non confermata**: viene dal materiale di discussione. La riporto perché è la più semplice
fra quelle emerse, non perché sia stata scelta.

**Nessuna conferma in più** — le conferme che si possono evitare si evitano. Il menu «Genera
documento» dividerebbe le destinazioni in due gruppi:

```text
Genera documento

  Non conclude l'ordine
      Proforma
      … altri documenti non conclusivi

  Conclude l'ordine
      DDT vendita
      Vendita al banco
      Fattura accompagnatoria
      … altri che abbiamo realmente deciso
```

L'informazione starebbe **dove si sceglie**, nel momento in cui si sceglie.

## ⛔ La regola fisica, che sta SOPRA la matrice

> **Un collegamento documentale non autorizza mai a duplicare un movimento già avvenuto.**
> Il primo documento che produce realmente l'effetto fisico movimenta; quelli successivi
> conservano il collegamento ma **non ripetono lo stesso effetto**.

```text
Preventivo → Vendita al banco (scarico −1) → Fattura                  → nessun altro scarico
Ordine cliente (impegno 1) → DDT (scarico −1 + consumo impegno)
                           → Vendita al banco                        → nessun secondo scarico
                           → Fattura                                 → nessun secondo scarico
Ordine cliente → Vendita al banco (scarico + consumo impegno)
                           → Fattura accompagnatoria                 → nessun secondo scarico
```

⚠️ **Non è una regola nuova**: è lo stesso principio che questa specifica applica già — il
documento conserva gli effetti realizzati a monte e non li duplica. Scriverla sopra la
matrice serve perché con l'arrivo della Vendita al banco le catene diventano più d'una, e la
tentazione di trattare il caso «per nome di documento» cresce con esse.

⛔ **Nessun trattamento speciale basato sul nome.** Chi implementa non scrive «se è
un'accompagnatoria non scaricare»: applica la regola comune, e il nome del documento non
entra nella condizione.

## ⛔ L'eliminazione non è una cascata — deciso il 18/08/2026

> **L'eliminazione di un documento non elimina MAI a cascata i documenti generati da esso.**
> Neutralizza soltanto gli **effetti propri** del documento eliminato; i documenti successivi
> restano esistenti, con i propri effetti.

**Vale per tutti i tipi**, non per una famiglia. È il rovescio della regola fisica qui sopra: se
un collegamento non autorizza a **duplicare** un effetto già avvenuto, non autorizza nemmeno a
**cancellare** un documento che non è quello che si sta eliminando.

```text
Vendita al banco  →  Fattura

elimino la Vendita al banco
  → la Fattura RESTA, con i propri effetti
  → si neutralizzano SOLO gli effetti propri della vendita
```

⚠️ **La ragione non è di comodo.** Un documento successivo è un documento **autonomo già
creato**, e può essere già stato utilizzato operativamente: l'eliminazione di un predecessore
non autorizza a cancellarlo automaticamente.

### ⏸️ APERTO — l'effetto fisico che restava in capo alla sorgente eliminata

Questo caso nasce dall'incrocio fra la regola qui sopra e la regola fisica, e **non è deciso**.
Va registrato adesso perché la coppia che lo produce è già in matrice.

**Il caso.** La regola fisica dice che il primo documento della catena movimenta e i successivi
no. Quindi il documento successivo può **non avere mai prodotto** l'effetto fisico, perché lo
aveva già prodotto la sorgente. Se poi la sorgente viene eliminata, il suo effetto si neutralizza
— e nessuno dei due documenti sta più portando quell'effetto.

```text
Vendita al banco (scarico −1)  →  Fattura (nessun nuovo scarico: già avvenuto a monte)

elimino la Vendita al banco
  → il suo scarico si neutralizza: +1 torna in Giacenza
  → la Fattura resta, e non ha MAI scaricato
  → esiste una fattura di merce uscita, e la merce è in magazzino
```

**Quello che è deciso:** la catena **deve restare coerente**.

⛔ **Quello che NON è deciso, e non si decide automaticamente:** come si rialloca quell'effetto.
Le strade possibili — l'effetto passa al documento successivo, resta sganciato e si segnala,
oppure l'eliminazione della sorgente viene rifiutata finché la catena esiste — hanno conseguenze
molto diverse, e **nessuna è stata scelta**.

⚠️ **Non è un caso di laboratorio**: `Vendita al banco → Fattura` e
`Vendita al banco → Fattura accompagnatoria` sono in matrice, e la Vendita al banco è stata
appena dichiarata eliminabile (`docs/11` A2). Il caso si presenterà appena le due cose esistono
insieme.

⚠️ **E riguarda ogni catena, non solo questa**: vale per qualunque coppia in cui il documento
successivo **non produce un proprio movimento perché lo stesso effetto fisico è già stato
registrato da un predecessore**.

⛔ **Non si dica «eredita il movimento»**: nel database non esiste nessun trasferimento di
proprietà di un movimento da un documento a un altro. Il successivo semplicemente **non lo
produce**, e la formulazione va tenuta stretta o si finisce per cercare nel modello una cosa
che non c'è.

## Il terzo filtro, «non ancora consumato» — deciso il 18/08/2026

Un documento incluso in un altro deve **sparire dall'elenco** per i successivi, o si fattura due volte la stessa merce.

> **Deciso.** Ogni sorgente inclusa lascia un **legame vero**, e da quel momento non compare più
> nell'elenco che si apre premendo «Includi» e scegliendo quel tipo. Vale per **tutte** le
> sorgenti, non solo per l'Ordine cliente che oggi è l'unica ad averlo (**B2**).

**Il ritorno in disponibilità è uguale per tutti** _(deciso 18/08)_. Se il documento che aveva
incluso viene annullato, o la sorgente viene sganciata, la sorgente **torna includibile**. Non
si scrivono comportamenti diversi per tipo: quello che oggi fa l'Ordine cliente — riapre e
rimette il collegamento a vuoto — è la regola, non un caso suo.

⚠️ **La «bozza mai salvata» non è un caso da normare, ed è utile sapere perché.** In VestiFlow
un documento **nasce confermato**: `createDocumentRecord` lo crea e lo conferma nella stessa
transazione (**B0**). Una maschera compilata e mai salvata non esiste sul server, e l'inclusione
scrive il legame **solo al salvataggio** — quindi non consuma niente. Il caso si risolve da sé.

**Cardinalità: molti-a-uno, e già funziona.** Un documento può includere più documenti: in una
fattura si possono includere più DDT, e un Ordine cliente può includere più Preventivi.

⚠️ **Ma «dello stesso cliente» oggi NON è vero**, ed è misurato: il filtro cliente non esiste
(**B1**), e includere il documento di un altro cliente **cambia il cliente in testata**. La
cardinalità funziona; il primo dei tre filtri no.

⚠️ **E il controllo di duplicato copre una combinazione sola.** Esiste solo per
`DDT + Ordine cliente` (`customer-order-form.component.ts:3904-3927`): lo **stesso Preventivo si
può includere due volte nello stesso documento**, senza che niente lo segnali. — _letto_

### La casella «Seguirà doc. di vendita» — il filtro che il DDT porta con sé

_Misurato 15/08:_ sul DDT vendita esiste la casella **«Seguirà doc. di vendita»**. È una **dichiarazione d'intenzione**, spuntata dall'operatore _prima_ che la fattura esista; la fattura mostra solo i DDT così marcati. È un filtro diverso dagli altri due: la matrice dice quali _tipi_ sono ammessi, questa casella dice quali _documenti concreti_ compaiono.

**Default: non spuntata** (deciso 15/08). Criterio: chi non fa nulla finisce nel caso meno dannoso — un DDT interno non spuntato non sporca l'elenco degli includibili, mentre un DDT da fatturare non spuntato si scopre quando serve.

⚠️ **Ha quattro lettori, non uno** — misurato il 18/08: oltre al filtro degli includibili, la
leggono la stampa PDF del server (`document-pdf.service.ts:439`), l'anteprima di stampa client
(`document-print-preview.component.ts:292`) e il dettaglio (`sales-document-detail.component.ts:150`).
Chi conta i punti da toccare deve saperlo. — _letto_

**Aperto:** se serva un avviso. Un DDT uscito senza spunta è invisibile alla fattura: la merce è consegnata, non risulta da fatturare, e ci si accorge quando il cliente non riceve la fattura.

## ⛔ Due consumi diversi, e non vanno confusi — deciso il 18/08/2026

È la distinzione che regge tutta la colonna «Genera», ed è emersa decidendo la Proforma.

```text
CONSUMO DOCUMENTALE   la sorgente è stata usata: non si include più, non genera più
CONSUMO DELL'IMPEGNO  la merce è davvero uscita: l'Impegnata diventa uscita reale
```

**Non sono la stessa cosa e non scattano insieme.** L'esempio è la coppia già approvata:

```text
Ordine cliente → Proforma    consumo documentale  SÌ   ← l'ordine è stato usato
                             consumo dell'impegno NO   ← niente è ancora uscito
Proforma       → DDT         il DDT realizza l'uscita, e lì l'impegno si consuma
```

> **La Proforma non impedisce il DDT: sposta il punto da cui lo si genera.** Una volta incluso
> l'ordine nella Proforma, quell'ordine non si include più e non genera più nulla — **la catena
> prosegue dalla Proforma.**

⚠️ **Quindi «non più generabile» NON è una proprietà della coppia: è una proprietà della
sorgente**, e vale secca. Quello che cambia con la coppia è **quale effetto fisico** scatta —
che è l'altro consumo.

✅ **Il motore separa già i due consumi**, ed è la misura che rende piccolo questo lavoro:

| Consumo          | Chi lo scrive                                         | Innescato da                              |
| ---------------- | ----------------------------------------------------- | ----------------------------------------- |
| **documentale**  | `syncIncludedSalesOrdersTx` → `SalesOrder.documentId` | il DTO dichiara le sorgenti incluse       |
| **dell'impegno** | `concludeLinkedManualOrderTx`                         | `documentTypeUnloadsStockOnConfirm(tipo)` |

⛔ **Sono le LISTE a essere fuse, non i meccanismi** (**B5**). `canAttachOrders` ammette solo
`sales_ddt` e `invoice_accompanying` con un OR scritto a mano, e `concludePrefill` valida le
destinazioni contro `DOCUMENT_STOCK_UNLOAD_TYPES`, che è la lista dell'effetto fisico.

> **Ne discende il lavoro vero: separare le due liste.** Una dice «chi può ricevere una sorgente
> documentale», l'altra dice «chi scarica il magazzino». La Proforma sta nella prima e non nella
> seconda — e finché è una lista sola, quella coppia non è esprimibile.

## Due verifiche prima di scrivere

| #    | Domanda                                                                                                    | Perché conta                      |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 11.1 | Il legame regge **tipi misti**? Due preventivi _e_ tre DDT nello stesso documento                          | decide se qui serve una migration |
| 11.2 | Come è modellato lo **stato di consumo**? Campo sul documento incluso, o dedotto dall'esistenza del legame | decide se serve una colonna       |

⚠️ _Misurato, e cambia il piano:_ `includeSourceKindsForDocumentType(type)` restituisce oggi `[]` per tutto tranne il DDT vendita (`06b` §D.15). Per la Fattura l'inclusione **non esiste ancora**: la strada è la conversione, non l'inclusione. Va letto prima di stimare questo punto.

---

# B · Come ragiona il codice OGGI — misurato il 18/08/2026

⚠️ **Questa sezione è MISURA, non specifica.** Descrive cosa il codice fa, non cosa deve fare.
Ogni voce porta il riferimento e il grado di certezza — **letto** (ho letto quella riga),
**dedotto** (segue dal meccanismo, non l'ho visto accadere), **da provare** (serve eseguire).
Ogni reperto è stato riaperto e riverificato da un secondo lettore indipendente; dove il primo
si era sbagliato, qui sta la versione corretta.

## B0. Non c'è un motore. Ce ne sono sei, e non si conoscono

«Il sistema Includi/Genera esiste già ed è operativo su una parte delle relazioni» è vero, ma
sottostima la dispersione. **Includi** ha quattro implementazioni indipendenti; **Genera** ne
ha due. — _letto_

| Flusso                                          | Dove vive                                                                  | Traccia sul server                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Includi** Preventivo → DDT                    | pannello condiviso `document-include-panel`                                | ⛔ **nessuna**: solo righe copiate                                              |
| **Includi** Ordine cliente → DDT / accompagnat. | stesso pannello                                                            | ✅ `syncIncludedSalesOrdersTx`, colonna `SalesOrder.documentId`                 |
| **Includi** Ordine fornitore → Arrivo merce     | pannello proprio, `goods-receipt-form.component.html:2091`                 | parziale                                                                        |
| **Includi** Arrivo merce → Fattura fornitore    | pannello proprio, `purchase-invoice-form.component.html:691`               | ✅ `GET /documents/linkable-goods-receipts` + `PurchaseInvoiceGoodsReceiptLink` |
| **Genera** → Fattura / Proforma                 | `POST /documents/:id/convert-prefill` → `buildConversionDto`               | ✅                                                                              |
| **Genera** → DDT vendita                        | ⛔ **non passa dal backend**: `customer-order-form.component.ts:1956-2041` | ⛔ ricostruito client-side da `GET /documents/:id`                              |

⛔ **Chi progettasse il contratto delle coppie dentro `buildConversionDto` lascerebbe fuori metà
delle coppie già esistenti, e non se ne accorgerebbe**: la maschera DDT continuerebbe a
funzionare. `convertPrefill` ha **un solo chiamante** in tutto il frontend
(`sales-document-form.component.ts:2494`). — _letto_

✅ **Ma un modello server-side di inclusione con tabella ponte ESISTE GIÀ**, ed è quello degli
acquisti: `PurchaseInvoiceGoodsReceiptLink` (`schema.prisma:2415`) e `InvoiceSalesDdtLink`
(`:2441`). Sulla forma non c'è niente da inventare: c'è da scegliere se generalizzarla. — _letto_

## B1. Dei tre filtri, il codice ne implementa uno e mezzo

| Filtro      | Stato                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Tipo**    | ✅ c'è                                                                                                                              |
| **Stato**   | ◐ solo per l'Ordine cliente (`includable` → `documentId: null`); per il Preventivo si filtra il solo `Cancelled`, e **lato client** |
| **Cliente** | ⛔ **non esiste**                                                                                                                   |

⛔ **Il `customerId` non viaggia in nessuna delle due chiamate** del pannello
(`document-include-panel.component.ts:131-181`): l'elenco propone i documenti di **tutti** i
clienti. — _letto_

⚠️ **E non è un limite dell'API**: il filtro esiste su entrambi i lati server
(`document.service.ts:73` lo sa costruire, `sales-order-query.util.ts:60-62` lo sa applicare).
È una scelta del pannello. — _letto_

⛔ **Il seguito è peggio del difetto.** Includendo il documento di un altro cliente, il DDT
**cambia cliente da solo**: `customer-order-form.component.ts:3932-3940` fa
`customerId.setValue(payload.sourceCustomerId)` sotto la sola condizione `if (this.isSalesDdt)`,
**senza vincolo sul tipo di sorgente**. È l'opposto di quanto dichiarano il commento della stessa
funzione (`:3892-3896` — «I dati di testata restano quelli del documento corrente») e la promessa
fatta all'operatore dal pannello (`document-include-panel.component.html:26-27`). — _letto_

### Perché l'ereditarietà della testata non serve mai — misurato

⛔ **Quando si preme «Includi», il cliente è GIÀ scelto.** I pulsanti stanno dentro un
`<fieldset [disabled]="headerGateActive()">` (`customer-order-form.component.html:823`,
pulsanti a `:846-864`): finché la testata non è compilata sono spenti.

> **Quindi la sovrascrittura non riempie un campo vuoto: scrive sopra un dato che c'è già ed
> è quello giusto.** Non è un aiuto che si spinge troppo in là — è solo un danno.

⚠️ **Ma il gate copre i PULSANTI, non il pannello**, e questo cambia dove va messa la
correzione. Il pannello vero (`app-slide-panel` con dentro `app-document-include-panel`) sta a
`:2720-2733`, cioè **fuori dal form e fuori da quel fieldset**. — _letto_

⛔ **E una via che lo scavalca esiste già**: il parametro di rotta `?includeOrder=<id>` chiama
`onDocumentIncluded` **direttamente**, senza passare né dal pannello né dal gate
(`customer-order-form.component.ts:1935-1946`). — _letto_

> **Ne discende l'ordine delle due correzioni.** Un filtro cliente messo sul pannello non
> coprirebbe la via `?includeOrder`; togliere la sovrascrittura sì, perché sta a valle di
> entrambe le strade.

### Il difetto non è solo «si vede il cliente sbagliato»

L'elenco è **paginato a 30 righe e ordinato per data** (`document-include-panel.component.ts`,
`LIST_PAGE_SIZE`; `documents.service.ts:471` ordina per `documentDate desc`). Su un tenant con
qualche centinaio di preventivi, quello del cliente giusto di tre mesi fa **non compare
affatto**: bisogna sapere di doverlo cercare per nome nella casella di ricerca. — _letto_

Il filtro non è quindi una comodità: è ciò che rende l'elenco utilizzabile.

## B2. Lo stato di consumo esiste per una sorgente su quattro

⛔ **Del Preventivo incluso non resta NIENTE**: né id, né tipo, né flag. Solo il testo di una
riga, «Rif. Preventivo PRE-… del gg/mm/aaaa». — _letto_

Verificato per assenza con termini indipendenti: `grep consumedAt|includedInDocument|convertedTo|quoteId`
sull'intero `schema.prisma` → **zero occorrenze**. L'unica self-relation documento↔documento è
`sourceDocument`/`derivedDocuments` (`schema.prisma:2143-2144`), che è la **generazione**, non
l'inclusione. — _letto_

> **Conseguenza: lo stesso preventivo si può includere in dieci DDT, e nessuno se ne accorge.**
> È il difetto che questa specifica nomina per primo — «o si fattura due volte la stessa merce».

**Per l'Ordine cliente il meccanismo c'è ed è corretto**, e il commento lo dichiara: «è il
COLLEGAMENTO (`documentId`) a rendere un ordine non più includibile — non lo stato di evasione»
(`sales-order-query.util.ts:77-79`). Cardinalità: **FK singola** su `SalesOrder`, quindi un
ordine sta in **al massimo un** documento. — _letto_

## B3. «Non più generabile» non esiste in nessuna forma

⛔ **Dalla generazione l'origine non viene mai toccata.** Nessuna `update` la raggiunge, né nel
prefill né alla creazione. Dallo stesso DDT si generano dieci fatture, senza che niente lo
impedisca né lo segnali. — _letto_

⛔ **E `sourceDocumentId` viene scritto senza alcuna verifica** (`documents.service.ts:1079`):
non che il documento esista, non che sia dello stesso tenant, non che sia un predecessore legale.
Il DTO lo valida solo come `@IsUUID()` (`create-document.dto.ts:197-199`). — _letto_

### La verifica del tenant sul legame — registrata altrove

**In lettura la relazione non è filtrata per tenant**: `getById` (`:735-763`) filtra il
documento ma non i due `include` (`sourceDocument`, `derivedDocuments`). — _misurato_

> ⛔ **Non è materia di questa specifica e non aspetta nessuna delle decisioni aperte qui.**
> **Fonte canonica: `docs/GUARDIE-MANCANTI.md` voce 20** — i tre gradi separati (misurato ·
> dedotto · da verificare) e i passi della prova cross-tenant stanno lì. ⚠️ **Non va chiamata una
> fuga di dati finché la prova dinamica non la conferma.**

## B4. La coppia è un FILTRO, non un comportamento

La domanda architetturale — «il codice distingue la coppia origine→destinazione, o decide solo
sulla destinazione?» — ha una risposta più precisa di «no».

Il backend distingue la coppia **solo per decidere se l'operazione è ammessa**
(`documents.service.ts:2477-2491`). Tutto ciò che riguarda il **contenuto** del precompilato
guarda la sola destinazione: `loadsStock` (`:2551`), il ripiego location (`:2507`). Dall'origine
dipendono due sole cose, entrambe cosmetiche: il testo della nota interna (`:2502-2504`) e il
pass-through di `sourceDocumentType` (`:2519`). Il motore client-side non guarda l'origine
affatto. — _letto_

## B5. ⛔ Il vincolo che decide la forma del lavoro: una lista che fa due mestieri

> **`DOCUMENT_STOCK_UNLOAD_TYPES` dichiara un EFFETTO FISICO e viene usata come elenco di COPPIE
> AMMESSE.**

`document-stock.constants.ts:23-27` elenca i tipi che scaricano alla conferma. La stessa costante
è consultata da `concludePrefill` (`manual-sales-orders.service.ts:562`) come elenco delle
destinazioni valide di «Concludi ordine», e servita al frontend come menu. — _letto_

⛔ **Ne discende che non si può aggiungere una destinazione al menu senza darle anche lo scarico
di magazzino** — e questo blocca la coppia già approvata `Ordine cliente → Proforma`, che deve
essere una destinazione e **non** deve scaricare.

⚠️ **E la lista NON è un punto unico**: ha cinque consumatori, tre dei quali portano un elenco
cablato e indipendente, e **i tre oggi si contraddicono già** su `manual_unload`: — _letto_

```text
concludePrefill               ACCETTA manual_unload   (valida contro la costante)
canAttachOrders               lo RIFIUTA con 422      (documents.service.ts:1315-1321, OR a mano)
unloadTypeOptions (frontend)  lo ESCLUDE a mano       (customer-order-form.component.ts:979-986)
concludeTargetRoute           non lo mappa: null      (:5047-5056 — il clic non farebbe nulla)
```

Oggi la contraddizione è innocua solo perché il frontend la nasconde.

## B6. Il consumo dell'Impegnata è totale e incondizionato

`consumeReservationTx` **non accetta una quantità**: azzera sempre tutto il residuo
(`stock-reservation.service.ts:151`). E `concludeLinkedManualOrderTx` (`documents.service.ts:3143`)
consuma **prima** di calcolare la copertura: — _letto_

```text
3204-3216   per ogni impegno attivo → consumeReservationTx    ← INCONDIZIONATO
3220-3231   SOLO ORA calcola fullyCovered
3232-3241   se coperto → fulfilled ; altrimenti → partially_fulfilled
```

> **Un DDT che copre 1 pezzo su 3 azzera comunque l'Impegnata di tutti e 3**, e lascia l'ordine
> «Parzialmente concluso» con `documentId` occupato.

⛔ **E la chiusura parziale non è rappresentabile oggi**, per due ragioni indipendenti:

1. `SalesOrderLine` **non ha** una colonna di quantità evasa. Il precedente esiste solo negli
   acquisti: `SupplierOrderLine` ha `orderedQuantity`/`receivedQuantity`. — _letto_
2. `SalesOrder.documentId` è una **FK singola**: il residuo evaso con un secondo documento non ci
   sta. Servirebbe una tabella ponte, come quelle che il progetto ha già. — _letto_

✅ **Ma la forma del dato per un residuo c'è già**: `StockReservation` porta `quantity` e
`remainingQuantity` come due colonne distinte, e `StockReservationEvent` porta `quantityDelta` e
`remainingAfter`. È il comportamento a non usarle, non la struttura a mancare. — _letto_

## B7. Un comando che oggi non funziona: DDT → Proforma

Il menu del DDT offre la voce **Proforma** e la mappa su una rotta, ma il percorso **è rifiutato
dal DTO d'ingresso** prima che il servizio veda la richiesta: la relazione **appare implementata
e non funziona**. — _dedotto_

> **Difetto canonico, con causa, file e prova dinamica attesa: `docs/GUARDIE-MANCANTI.md` voce 21.** Qui resta la misura, perché fa parte della fotografia del motore.

## B8. Quanti punti si toccano per aggiungere UNA coppia

Contati riaprendo i file, non stimati. — _letto_

| Per aggiungere una coppia a… | Punti                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Genera**, lato server      | **3** — enum del DTO, costante per-origine, ramo in `buildConversionDto`                                                  |
| **Genera**, lato client      | **3** — voce di menu, `switch` di rotta, guardia di permesso (e gli `switch` sono **quattro** in tutto, contando Duplica) |
| **Includi**, sorgente nuova  | **5** — enum `IncludeSourceKind`, etichette, `includedPayloadFrom*`, e i **due** ternari del pannello                     |
| **Copia delle righe**        | **almeno 8** mappature riga-per-riga scritte a mano, con insiemi di campi diversi fra loro                                |

⚠️ **E il punto unico dichiarato non è unico**: `includeSourceKindsForDocumentType` la usa solo
`sales-document-form`. L'Ordine cliente la **scavalca** con una catena ternaria a tre rami e una
seconda costante esportata, `CUSTOMER_ORDER_INCLUDE_SOURCES` — che la funzione non legge. — _letto_

## B9. Il modello giusto esiste già nel progetto, e ha una guardia

⚠️ **Non è materia da inventare.** La mappa famiglia→tipi dei permessi è tenuta in due file
specchio, frontend e API, e **`npm run lint` fallisce se divergono** (`scripts/check-permissions.mjs`).
Il commento dichiara il difetto che quella guardia evita: «la UI mostra un'azione che l'API poi
rifiuta». — _letto_

> **È esattamente il difetto che oggi hanno le liste di conversione, che nessuno sorveglia** — e
> infatti B7 lo misura già accaduto.

E `SALES_FORM_ROUTE_SEGMENT` (`document-routing.util.ts:28`) è un `Record<...>` **esaustivo**: un
tipo senza segmento **non compila**. È la forma di punto unico che il progetto usa già, e che i
tre `switch` di rotta non usano. — _letto_

---

## ✅ La Proforma non è più «da censire» — 21/08/2026

_Il proprietario ha ritirato la cautela: «la mappatura è già stata definita completamente, non
va riaperta»._ La riga mancante è stata **censita nel codice**, non decisa a tavolino:

|             |                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Includi** | ⛔ **niente**. `IncludeSourceKind` non comprende la Proforma, e il commento del codice dice perché: «aggiungerci Proforma e DDT li renderebbe sorgenti includibili — un effetto che nessuno ha chiesto» |
| **Genera**  | ✅ **DDT vendita · Fattura**. `CONVERSION_SOURCE_LABELS` la porta come origine di conversione                                                                                                           |

⚠️ **Non è una decisione nuova**: è la lettura di ciò che il codice fa, che è esattamente quello
che «da censire» chiedeva. Le voci residue in `11` A7, `00` e `DA-FARE` sono state tolte.
