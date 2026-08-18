# 12 · Collegamenti fra documenti — «Includi» e «Genera»

**Stato:** specifica corrente · **18/08/2026**
**Perimetro:** tutti i tipi documento, non una famiglia sola.

> **Come i documenti si agganciano fra loro, e che cosa succede al magazzino quando lo fanno.**

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
| **Proforma**                | ⏸️ da censire nella matrice definitiva                           | ⏸️ da censire — oggi genera già verso DDT vendita e Fattura                                                                                                                                                                                        |

### Che cosa di questa tabella è già approvato, e che cosa no

Serve o fra sei mesi la differenza non si vede più.

| Parte                                                                                        | Stato                                                                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| colonna **Includi** per Ordine cliente · DDT · Fattura · Accompagnatoria, «mai DDT» compresa | **decisa 15/08**                                                                    |
| **Fattura → Nota di credito** e **Accompagnatoria → Nota di credito**                        | **deciso 16/08**, con la tabella per tipo in `07` §6                                |
| la **Vendita al banco** in entrambe le colonne                                               | **deciso 18/08**                                                                    |
| tutto il resto della colonna **Genera**                                                      | **nuovo, deciso il 18/08** — non era mai stato scritto                              |
| **Proforma**                                                                                 | **non deciso**: da censire — ma quello che genera oggi è misurato, e sta nella riga |

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
l'accompagnatoria che la include **eredita** il fatto che lo scarico è avvenuto — non lo
ripete. È la regola fisica qui sotto, non un'eccezione per questo tipo.

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

⚠️ **Il ✔ nella matrice è mio, ed è quindi anch'esso una proposta**: l'ho messo scrivendo
questa sezione. Va confermato o tolto insieme al resto.

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

## Il terzo filtro, «non ancora consumato»

Un documento incluso in un altro deve **sparire dall'elenco** per i successivi, o si fattura due volte la stessa merce.

_Misurato 15/08:_ sul DDT vendita esiste la casella **«Seguirà doc. di vendita»**. È una **dichiarazione d'intenzione**, spuntata dall'operatore _prima_ che la fattura esista; la fattura mostra solo i DDT così marcati. È un filtro diverso dagli altri due: la matrice dice quali _tipi_ sono ammessi, questa casella dice quali _documenti concreti_ compaiono.

**Default: non spuntata** (deciso 15/08). Criterio: chi non fa nulla finisce nel caso meno dannoso — un DDT interno non spuntato non sporca l'elenco degli includibili, mentre un DDT da fatturare non spuntato si scopre quando serve.

**Aperto:** se serva un avviso. Un DDT uscito senza spunta è invisibile alla fattura: la merce è consegnata, non risulta da fatturare, e ci si accorge quando il cliente non riceve la fattura.

## Due verifiche prima di scrivere

| #    | Domanda                                                                                                    | Perché conta                      |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 11.1 | Il legame regge **tipi misti**? Due preventivi _e_ tre DDT nello stesso documento                          | decide se qui serve una migration |
| 11.2 | Come è modellato lo **stato di consumo**? Campo sul documento incluso, o dedotto dall'esistenza del legame | decide se serve una colonna       |

⚠️ _Misurato, e cambia il piano:_ `includeSourceKindsForDocumentType(type)` restituisce oggi `[]` per tutto tranne il DDT vendita (`06b` §D.15). Per la Fattura l'inclusione **non esiste ancora**: la strada è la conversione, non l'inclusione. Va letto prima di stimare questo punto.
