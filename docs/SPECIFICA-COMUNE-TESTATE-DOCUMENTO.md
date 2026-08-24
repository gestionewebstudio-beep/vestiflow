# Specifica comune — Testate documento, controparti, Location, date, serie e numerazione

**Stato:** specifica normativa consolidata  
**Data:** 24/08/2026  
**Perimetro:** testate dei documenti e delle registrazioni VestiFlow  
**Scopo:** definire una sola volta struttura, semantica e comportamento dei campi comuni di testata, lasciando ai singoli documenti soltanto le eccezioni reali.

> Le decisioni più recenti confermate prevalgono sul codice osservato, sugli audit e sulle specifiche precedenti incompatibili.
>
> Il codice corrente va usato per individuare gap e cause radice, non come fonte automatica del requisito.

---

# 1. Principio generale

I documenti VestiFlow devono usare un **contratto comune di testata** per i concetti condivisi:

- Cliente / Fornitore;
- Location;
- Data documento;
- Serie;
- Numero;
- eventuali riferimenti a documenti esterni;
- campi specifici realmente necessari al singolo documento.

Non devono esistere implementazioni locali diverse dello stesso concetto senza una ragione funzionale.

La testata comune deve essere componibile:

```text
campi/componenti comuni
        ↓
configurazione del tipo documento
        ↓
testata del documento
```

Il singolo documento stabilisce:

- quali campi sono presenti;
- quali sono obbligatori;
- quali etichette specifiche usa quando il significato lo richiede;
- quali eccezioni funzionali applica.

---

# 2. Data funzionale e timestamp tecnico

## 2.1 Data documento

Per i normali documenti VestiFlow esiste una **Data documento**:

- proposta con la data corrente in creazione;
- visibile all'operatore;
- modificabile;
- persistita;
- caricata dal documento alla riapertura;
- distinta dal timestamp tecnico di creazione.

La Data documento è il riferimento funzionale del documento.

## 2.2 `createdAt`

`createdAt` è:

- generato automaticamente da VestiFlow;
- tecnico;
- non scelto dall'utente;
- normalmente non esposto come campo operativo;
- distinto dalla Data documento;
- non deve essere riscritto per farlo coincidere con la Data documento.

La modifica della Data documento di un documento già salvato non deve rinumerarlo automaticamente.

## 2.3 Eccezione terminologica: Registrazione fattura fornitore

Nella **Registrazione fattura fornitore**, la data interna VestiFlow si chiama:

> **Data registrazione**

Il nome è volutamente diverso da "Data documento" perché nella stessa testata esiste anche:

> **Data fattura**

che è la data riportata sul documento ricevuto dal fornitore.

L'infrastruttura di numerazione interna resta comunque quella comune VestiFlow.

---

# 3. Numerazione comune

## 3.1 Struttura

Dove il documento è numerato, il blocco comune è:

```text
Data
Serie
Numero
```

con le etichette specifiche previste dal documento.

## 3.2 Progressivo

Regola definitiva:

> **Il progressivo dipende dalla Serie. La Location non crea mai un progressivo separato.**

L'identità funzionale del numeratore è quindi:

```text
tenant + tipo di numerazione + serie
```

La Location può soltanto influire sulla **disponibilità della Serie** nella testata.

Non esistono progressivi distinti:

```text
Serie A / Napoli
Serie A / Milano
```

Se è la stessa Serie A, il progressivo è uno solo.

## 3.3 Serie globali e Serie legate a una Location

Una Serie può essere:

- **globale** → disponibile in tutte le Location consentite;
- **associata a una Location** → disponibile soltanto quando quella Location è il contesto della testata.

Il collegamento Location ↔ Serie è quindi:

> **filtro di disponibilità, non partizione del progressivo.**

## 3.4 Cambio Location

Su documento nuovo, cambiando Location:

1. si ricaricano le Serie disponibili;
2. una Serie non più compatibile non deve restare selezionata come se fosse valida;
3. viene proposta una Serie compatibile secondo il sistema comune;
4. il Numero mostrato viene aggiornato come proposta coerente.

Su documento già salvato, Serie e Numero sono dati del documento e non devono essere riscritti automaticamente solo perché la configurazione corrente delle Serie è cambiata.

## 3.5 Numero proposto e numero assegnato

VestiFlow propone il Numero secondo il motore comune.

La proposta non deve creare conflitti fra operatori: l'assegnazione definitiva deve essere protetta lato server.

L'eventuale possibilità di imporre manualmente un numero segue la specifica comune di numerazione e non viene ridefinita nelle singole testate.

---

# 4. Location — modello generale

## 4.1 Location = entità reale

Una Location VestiFlow è un luogo fisico/logico reale su cui vive l'inventario.

Non creare una Location fittizia chiamata:

> `Tutte le location`

per risolvere esigenze di consultazione.

## 4.2 `null` significa nessuna scelta

Regola definitiva:

> **`locationId = null` / campo vuoto significa esclusivamente "nessuna Location selezionata".**

Non significa mai automaticamente:

- tutte le Location;
- la prima Location disponibile;
- l'unica Location disponibile;
- la Location del negozio corrente;
- un fallback implicito.

Questa distinzione è intenzionale.

## 4.3 Motivazione operativa

Un responsabile può lavorare su più Location.

In questo caso può essere corretto **non assegnargli alcuna Location predefinita**.

VestiFlow deve quindi lasciare il campo vuoto e obbligarlo a scegliere consapevolmente la sede per l'operazione corrente.

Obiettivo:

> **ridurre il rischio di registrare documenti o movimenti sulla Location sbagliata.**

Questa logica non è un difetto UX: è una protezione operativa deliberata.

## 4.4 Location predefinita

La Location predefinita:

- è opzionale;
- deve essere assegnata esplicitamente all'utente;
- può precompilare i documenti nuovi;
- deve essere tra le Location su cui l'utente può operare;
- non rende il campo non modificabile;
- non deve sporcare il form come modifica dell'utente.

Non dedurre mai automaticamente la predefinita dal fatto che l'utente abbia una sola Location visibile.

## 4.5 Permessi: consultazione vs operatività

Mantenere la distinzione già correttamente presente nell'architettura VestiFlow:

- Location **consultabili**;
- Location **operative/scrivibili**;
- Location di destinazione del Trasferimento.

Un utente può avere il permesso di consultare più Location senza avere il diritto di eseguire operazioni fisiche su tutte.

Frontend e backend devono applicare la stessa regola.

## 4.6 Location obbligatoria

Quando la matrice del documento richiede una Location reale:

- il campo vuoto deve produrre un alert/errore chiaro;
- il salvataggio o l'azione che richiede la Location deve essere bloccata;
- il backend deve rifiutare una richiesta senza Location valida;
- il backend deve rifiutare una Location fuori dallo scope operativo dell'utente.

---

# 5. "Tutte le location" — capacità opzionale, non regola generale

## 5.1 Principio

La voce **Tutte le location** ha senso solo in contesti nei quali la Location rappresenta anche un **ambito di consultazione**.

Non va aggiunta automaticamente al selettore Location di tutti i documenti.

In particolare non ha senso nei documenti che richiedono un effetto fisico su una sede precisa, come:

- Arrivo merce;
- Vendita al banco;
- Reso al banco;
- DDT;
- Fattura / Accompagnatoria quando il documento usa una Location reale;
- Trasferimento;
- altri movimenti fisici.

## 5.2 Contesti possibili

La capacità può essere prevista, se funzionalmente utile, in:

- Ordine fornitore;
- consultazione giacenze;
- alcune viste di magazzino;
- report;
- strumenti gestionali non fisici;
- altri moduli solo dopo decisione specifica.

Non estenderla automaticamente a Inventario o altri documenti fisici: va deciso caso per caso.

---

# 6. Ordine fornitore — Location e ambito giacenze

## 6.1 Semantica

Nell'Ordine fornitore la Location **non rappresenta ancora la destinazione fisica definitiva della merce**.

Se è selezionata una Location, significa:

> l'ordine viene preparato nel contesto di quella Location e le giacenze mostrate sono quelle della sede selezionata.

La destinazione fisica effettiva della merce viene determinata quando avviene il carico reale, ad esempio nell'Arrivo merce.

## 6.2 Stati ammessi

L'Ordine fornitore deve distinguere tre stati funzionali:

```text
1. nessuna scelta
2. Location specifica
3. Tutte le location
```

Questi stati non devono essere confusi.

### Nessuna scelta

- `locationId = null`;
- nessun ambito esplicitamente scelto;
- mantiene alert/validazione secondo la UI;
- non deve essere interpretato come "Tutte".

### Location specifica

- `locationId = id reale`;
- giacenze riferite alla Location scelta;
- Serie disponibili = globali + quelle associate a quella Location.

### Tutte le location

- è uno **scope esplicito di consultazione**, non una Location;
- mostra le giacenze aggregate/complessive delle Location che l'utente è autorizzato a consultare;
- `locationId` non viene valorizzato con una sede fittizia;
- lo stato "Tutte" deve essere distinto esplicitamente dallo stato "nessuna scelta".

## 6.3 Serie con "Tutte le location"

Con scope **Tutte le location** non esiste una Location reale da usare come filtro.

Per coerenza col modello attuale:

> **sono proponibili soltanto le Serie globali, cioè non vincolate a una Location specifica.**

Il progressivo resta comunque quello della Serie scelta.

## 6.4 Permessi

"Tutte le location" significa:

> tutte le Location che l'utente è autorizzato a consultare.

Non amplia i permessi.

---

# 7. Controparti: Cliente e Fornitore

Cliente e Fornitore usano i componenti/anagrafiche comuni.

Regole:

- il documento dichiara se la controparte è obbligatoria o facoltativa;
- i valori dell'anagrafica possono precompilare il documento;
- un valore predefinito non diventa automaticamente non modificabile;
- il documento salvato mantiene il proprio snapshot;
- una modifica successiva dell'anagrafica non deve riscrivere automaticamente il documento.

La matrice seguente è la fonte normativa sull'obbligatorietà.

---

# 8. Matrice definitiva delle testate

| Documento                           | Controparte                  | Location                                                                       | Data interna           | Serie  | Numero     | Campi specifici                                                                     |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ | ---------------------- | ------ | ---------- | ----------------------------------------------------------------------------------- |
| **Arrivo merce**                    | **Fornitore obbligatorio**   | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | Tipo documento fornitore, Numero documento fornitore, Data documento fornitore      |
| **Ordine fornitore**                | **Fornitore obbligatorio**   | Location specifica oppure **Tutte le location**; nessuna scelta resta distinta | **Data documento**     | Sì     | Sì         | Nessun riferimento/conferma/consegna prevista                                       |
| **Preventivo**                      | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | —                                                                                   |
| **Ordine cliente**                  | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | —                                                                                   |
| **DDT**                             | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | sezioni trasporto/destinazione secondo specifica DDT                                |
| **Proforma**                        | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | —                                                                                   |
| **Fattura**                         | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | sezioni fiscali/pagamenti secondo relative specifiche                               |
| **Fattura accompagnatoria**         | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | trasporto/destinazione; condivide il progressivo della Fattura                      |
| **Nota di credito**                 | **Cliente obbligatorio**     | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | riferimento alla Fattura/Accompagnatoria origine secondo specifica                  |
| **Vendita al banco**                | Cliente facoltativo          | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | —                                                                                   |
| **Reso al banco**                   | Cliente facoltativo          | **Obbligatoria, reale**                                                        | **Data documento**     | Sì     | Sì         | nessun collegamento obbligatorio alla vendita originaria                            |
| **Trasferimento**                   | Nessuna                      | **Origine obbligatoria + Destinazione obbligatoria**                           | **Data documento**     | Sì     | Sì         | due Location reali e distinte                                                       |
| **Registrazione fattura fornitore** | **Fornitore obbligatorio**   | **Assente**                                                                    | **Data registrazione** | Sì     | Sì         | N. fattura, Data fattura                                                            |
| **Corrispettivo manuale**           | Nessuna controparte standard | **Obbligatoria**                                                               | **Data**               | **No** | automatico | registrazione economica minimale; Netto/Ivato e Pagamenti secondo propria specifica |

---

# 9. Arrivo merce — testata definitiva

La testata dell'Arrivo merce deve distinguere chiaramente il documento VestiFlow dal documento ricevuto dal fornitore.

## 9.1 Documento VestiFlow

```text
Fornitore        obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

## 9.2 Documento del fornitore

```text
Tipo documento fornitore
Numero documento fornitore
Data documento fornitore
```

Sono due identità separate.

## 9.3 Causale

> **La Causale va rimossa dalla testata Arrivo merce.**

Non deve essere mantenuta come requisito corrente solo perché presente in versioni precedenti.

Prima della rimozione tecnica definitiva, censire eventuali consumer; non conservarla funzionalmente per compatibilità con dati fittizi di sviluppo.

---

# 10. Ordine fornitore — semplificazione definitiva

La testata corrente deve essere semplificata a:

```text
Fornitore        obbligatorio
Location / ambito giacenze
Data documento
Serie
Numero
```

## 10.1 Campi da ritirare

Non fanno più parte del requisito:

- **Rif. ordine fornitore**
- **Consegna prevista**
- **Tipo documento esterno / conferma d'ordine**
- **Numero conferma/documento fornitore**
- **Data conferma/documento fornitore**

Non serve mantenere compatibilità con dati storici reali: l'ambiente attuale contiene solo dati di sviluppo.

## 10.2 `destinationLocationId`

Il vecchio significato "destinazione merce" è superato.

La nuova Location dell'Ordine fornitore è un **contesto operativo/di consultazione**, non la destinazione fisica definitiva.

Prima di riutilizzare, rinominare o eliminare il campo backend:

1. censire API, mapper, permessi e query;
2. individuare la causa radice delle dipendenze;
3. evitare di attribuire silenziosamente un nuovo significato a un campo legacy;
4. rimuovere il residuo se non serve alla nuova semantica.

---

# 11. Preventivo

Testata:

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

"Tutte le location" non è prevista.

---

# 12. Ordine cliente

Testata:

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

"Tutte le location" non è prevista.

Motivo:

> l'Ordine cliente può impegnare magazzino; l'impegno deve riferirsi a una Location reale.

---

# 13. DDT

Testata base:

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

Le sezioni di destinazione e trasporto restano governate dalla specifica DDT.

"Tutte le location" non è prevista.

---

# 14. Proforma

Testata:

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

La Proforma usa la propria numerazione secondo il motore comune.

---

# 15. Famiglia Fattura

## 15.1 Fattura

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

## 15.2 Fattura accompagnatoria

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

Condivide il progressivo della Fattura secondo la specifica numerazione.

Le sezioni trasporto/destinazione sono specifiche dell'Accompagnatoria.

## 15.3 Nota di credito

```text
Cliente          obbligatorio
Location         obbligatoria
Data documento
Serie
Numero
```

Condivide il progressivo della Fattura.

Il collegamento alla Fattura/Accompagnatoria origine è disciplinato dalla specifica della famiglia Fattura e non viene duplicato qui.

---

# 16. Vendita al banco e Reso al banco

## Vendita al banco

```text
Cliente          facoltativo
Location         obbligatoria
Data documento
Serie
Numero
```

## Reso al banco

```text
Cliente          facoltativo
Location         obbligatoria
Data documento
Serie
Numero
```

Nessuna voce "Tutte le location".

---

# 17. Trasferimento

Testata:

```text
Location origine         obbligatoria
Location destinazione    obbligatoria
Data documento
Serie
Numero
```

Regole:

- entrambe sono Location reali;
- Origine e Destinazione devono essere distinte;
- l'Origine segue lo scope operativo dell'utente;
- la Destinazione segue il contratto specifico già previsto per i trasferimenti;
- nessuna voce "Tutte".

Il Trasferimento usa la numerazione comune VestiFlow.

---

# 18. Registrazione fattura fornitore

La Registrazione fattura fornitore usa la numerazione interna comune, ma con etichette proprie per distinguere il documento VestiFlow dalla fattura ricevuta.

Testata:

```text
Fornitore          obbligatorio

Data registrazione
Serie
Numero

N. fattura
Data fattura
```

Non ha Location.

`Data registrazione + Serie + Numero` identificano la registrazione interna VestiFlow.

`N. fattura + Data fattura` identificano il documento ricevuto dal fornitore.

L'azione **Includi Arrivo merce** appartiene al sistema comune Includi/Genera, non alla semantica della testata.

---

# 19. Corrispettivo manuale

Il Corrispettivo manuale è una **registrazione economica semplice**, non un normale documento a righe articolo.

Non deve essere forzato dentro la testata standard completa.

Testata minimale:

```text
Location          obbligatoria
Data
Numero            automatico al salvataggio
```

Inoltre usa:

- modalità Netto/Ivato prevista dalla propria registrazione;
- righe economiche;
- Pagamenti/Tesoreria secondo la specifica comune.

Non aggiungere solo per uniformità:

- Cliente;
- Fornitore;
- Serie;
- blocchi documento esterno;
- campi della normale testata articolo.

---

# 20. Componenti comuni di testata

Dove il concetto è lo stesso, usare lo stesso componente/comportamento per:

- Cliente;
- Fornitore;
- Location;
- Data;
- Serie;
- Numero;
- eventuale gestione Serie;
- warning numerazione/cronologia;
- blocco editabilità dopo salvataggio.

Le eccezioni devono essere espresse come configurazione del documento.

> **Le §20.1–20.6 sono state assorbite il 24/08/2026** da un secondo documento
> (`SPECIFICA-COMUNE-TESTATE-DOCUMENTI.md`, con la I finale) nato in parallelo a questo.
> Due file con nomi che differivano per una lettera erano una trappola: chi cercava ne
> trovava uno a caso. Quel file non esiste più — **questo è l'unico**.

## 20.1 La decisione, in una riga

> **La testata di un documento si dichiara UNA VOLTA. Le due vesti — griglia su
> scrivania, pannello apribile su schermo compatto — le sceglie il componente comune,
> non la maschera.**

## 20.2 Il difetto che chiude, misurato

⛔ **Ogni maschera scriveva i propri campi due volte**: una nella griglia desktop, una nel
pannello mobile. Misurato il 24/08/2026 su otto maschere:

```text
template delle maschere documento     7.240 righe
di cui TESTATA                        2.152 righe   → il 30%
di cui seconda copia della prima      ~1.076 righe  → meta' della testata
```

Sul **Trasferimento**, la più piccola: 74 righe nel pannello contro 78 nella griglia.
Stessi quattro campi, stesse opzioni, stessi gestori. Cambiavano solo:

| Cosa           | Mobile              | Desktop               |
| -------------- | ------------------- | --------------------- |
| identificativo | `tr-m-origin-error` | `tr-origin-error`     |
| `aria-label`   | «Location origine»  | «Location di origine» |
| classi         | `doc-panel__*`      | `doc-form__*`         |

⚠️ **Non erano due viste: era la stessa vista scritta due volte**, nello stesso file, e ogni
correzione ne raggiungeva una sola.

⭐ **Il test la sorvegliava invece di segnalarla.** Lo spec del Trasferimento asseriva
`toHaveLength(2)` sull'avviso di numero proposto, col commento «Due copie: testata desktop e
pannello mobile convivono nel DOM». La doppia scrittura era diventata un requisito.

## 20.3 I pezzi, e come proiettano una volta sola in due posti

| Componente                      | Che cosa fa                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `app-document-header`           | la FORMA: griglia o pannello, e il riepilogo a pannello chiuso |
| `app-document-header-field`     | UN campo: etichetta, controllo proiettato, messaggio d'errore  |
| `app-document-mobile-panel`     | il pannello apribile                                           |
| `app-document-number-field`     | numero + serie                                                 |
| `app-document-counterparty-ref` | il documento della controparte                                 |

`<ng-content>` si riempie **una volta sola**: due `<ng-content>` nei due rami di un `@if`
lascerebbero il secondo vuoto. I campi entrano quindi in un `<ng-template>`, e i due rami ne
montano un'istanza ciascuno.

⚠️ **Le due vesti restano ESCLUSIVE**, non nascoste col foglio di stile — la regola della
«vista sola viva» (`03` §4.11). Sulla testata vale doppio: con due viste vive gli
identificativi dei campi non sono univoci, e ogni pannello condiviso può aprirsi in quella che
non si vede. È la forma tecnica del divieto già scritto al §21 («campi salvati solo da una
delle due viste»).

**Che cosa resta della maschera**: quali campi ci sono, le opzioni, i gestori, le validazioni,
il testo delle etichette. Che l'Arrivo merce abbia il fornitore e l'Ordine cliente il cliente
non è una copia — è un campo diverso, e lo dichiara la maschera.

## 20.4 Quattro regole di campo

**Un campo, un identificativo.** ⛔ Vietati gli identificativi doppi per lo stesso campo: non
esistono più `tr-*` e `tr-m-*`. Chi scrive `describedBy` cita quello.

**Un campo, un'etichetta.** ⛔ Vietate due `aria-label` per lo stesso campo: «Location
origine» e «Location di origine» erano lo stesso controllo con due nomi, e un lettore di
schermo lo annunciava diversamente a seconda della larghezza della finestra.

**Il campo in attesa non è un errore.** Un campo obbligatorio, ancora vuoto, che tiene ferme
le righe porta `[waiting]` → `--color-field-waiting`. **Non** il rosso dell'errore: aprire un
documento nuovo non è uno sbaglio dell'operatore (`regole-stile-ui` §5).

**Il messaggio d'errore non ripete il segnaposto.** Il default è «Campo obbligatorio.». Un
campo che dice «Seleziona un fornitore…» e sotto «Seleziona un fornitore.» è la stessa frase
due volte a quaranta pixel di distanza. E non si toglie del tutto: al rifiuto il segnaposto
cambia **solo tinta**, e chi non distingue i colori non vedrebbe accadere nulla.

## 20.5 Stato dell'adozione — 24/08/2026

| Maschera               | Testata comune | Righe prima → dopo |
| ---------------------- | -------------- | ------------------ |
| Trasferimento          | ✅             | 162 → 81           |
| Rettifica / Inventario | ✅             | 164 → 99           |
| Arrivo merce           | ✅ (2 fasce)   | 414 → 285          |
| Ordine fornitore       | ✅             | 320 → 212          |
| Documenti vendita      | ✅ (2 fasce)   | 445 → 285          |
| Vendita al banco       | ✅             | 150 → 91           |
| Registrazione fattura  | ✅             | 218 → 177          |
| **Ordine cliente**     | ⏳ **ultima**  | 598 → —            |

**Sette su otto: 1.711 → 1.149 righe (−33%).**

⚠️ **L'Ordine cliente non è rimasto indietro per caso**: serve quattro tipi documento ed è la
più grande. Ma è anche quella da cui dipende un difetto funzionale aperto — il campo
**«Listino» esiste solo nella vista mobile**, quindi da scrivania non si può scegliere il
listino su un ordine, un preventivo o un DDT. La migrazione lo porta su entrambe le viste.

⚠️ **Manca una NONA maschera**: il Movimento di magazzino
(`features/inventory/movement-form`) ha la stessa anatomia e la stessa doppia scrittura,
camuffata con `ariaLabel="Location (testata mobile)"` invece di un identificativo gemello —
quindi il controllo automatico non la vede. Non è mai entrata nel perimetro.

## 20.6 Come si rigenera la misura

```bash
# righe di testata per maschera
grep -c '' src/app/features/**/[a-z-]*form.component.html

# chi ha ancora due scritture: cerca gli identificativi gemelli
grep -rnE '"[a-z]{2}-m-[a-z-]+"' src/app/features --include=*.html
```

Il secondo comando è la prova che conta: **un identificativo con `-m-` è una testata ancora
scritta due volte**.

---

# 21. Mobile

La testata mobile deve usare lo stesso contratto dati della desktop.

Non creare una seconda semantica dei campi.

Sono ammessi:

- pannelli comprimibili;
- ordine visivo adattato;
- layout compatto.

Non sono ammessi:

- default diversi;
- Location diversa;
- Serie diversa;
- obbligatorietà diversa;
- campi salvati solo da una delle due viste.

## 21.1 ⏸ Due decisioni aperte — NON colmarle per verosimiglianza

Dichiarate **non decise** dal proprietario il 24/08/2026. Riguardano l'Ordine cliente, cioè il
riferimento visivo. Finché non sono decise, la testata comune le rende **come sono oggi**: non
è un'approvazione, è il non aver deciso al posto suo.

**a) Dove vanno numerazione e serie su mobile.** Oggi `app-document-number-field` sta in fondo
al pannello, dopo la data. Non è stato deciso se sia il suo posto. Il §21 ammette «ordine
visivo adattato», quindi la collocazione è legittima in astratto — ma quale sia quella giusta
resta da scegliere.

**b) Il selettore delle giacenze.** Sull'Ordine cliente **impegna** le giacenze; su altri
documenti lo stesso posto **scarica** o **carica**. Sono tre effetti fisici distinti — e
infatti sono due colonne distinte nel catalogo (`commitsStock`, `loadsStock`) con etichette
dal documento — ma **dove il comando vada in testata, e se debba starci**, non è stato deciso.

⛔ **Non sono la stessa domanda**, e confonderle è l'errore da evitare: la prima è di
collocazione, la seconda è di che cosa il comando fa.

---

# 22. Salvataggio e blocco

I campi di testata seguono il contratto comune dei documenti:

- nessun autosalvataggio implicito;
- Salva esplicito;
- dopo il salvataggio riuscito si resta nel documento e il documento si blocca;
- per modificare si entra nel normale flusso di modifica;
- i default programmatici non devono sporcare il form;
- modifiche non salvate devono attivare il guard comune.

---

# 23. Backend e sicurezza

Per ogni campo di testata significativo il backend deve verificare:

- tenant;
- esistenza dell'id;
- appartenenza al tenant;
- permessi dell'utente;
- obbligatorietà;
- coerenza Location/Serie;
- unicità/concorrenza della numerazione.

Non affidarsi al fatto che la UI nasconda opzioni non consentite.

---

# 24. Guide operative da aggiornare

Le guide VestiFlow devono spiegare chiaramente la logica Location.

Testo concettuale da riportare:

> Se lavori su più Location e non hai una sede predefinita, VestiFlow lascia intenzionalmente il campo Location vuoto. Devi scegliere la sede per l'operazione corrente. Questo riduce il rischio di registrare documenti o movimenti sul magazzino sbagliato.

Inoltre:

> La Location predefinita è una comodità opzionale. Per un responsabile che gestisce più sedi può essere preferibile non impostarla.

E:

> La Location può determinare quali Serie sono disponibili, ma non crea un progressivo separato. Il progressivo appartiene alla Serie.

Per l'Ordine fornitore:

> "Tutte le location" è un ambito di consultazione delle giacenze, non una sede fisica.

---

# 25. Criteri di accettazione principali

## HDR-001 — default Location

Utente con `defaultLocationId` valida.

Atteso:

- documento nuovo precompilato;
- campo modificabile;
- form non dirty per la sola precompilazione.

## HDR-002 — nessun default

Utente multi-Location senza predefinita.

Atteso:

- campo vuoto;
- nessun fallback;
- salvataggio bloccato nei documenti che richiedono Location reale.

## HDR-003 — permessi

Invio diretto API di Location non autorizzata.

Atteso:

- rifiuto backend.

## HDR-004 — Serie per Location

Location A selezionata.

Atteso:

- Serie globali + Serie A;
- nessuna Serie riservata a Location B.

## HDR-005 — progressivo

Stessa Serie usata in due Location.

Atteso:

- un solo progressivo della Serie;
- nessun contatore separato per Location.

## HDR-006 — cambio Location

Documento nuovo, cambio Location.

Atteso:

- elenco Serie ricaricato;
- Serie incompatibile non resta selezionata;
- proposta Numero aggiornata.

## HDR-007 — Arrivo merce

Atteso:

- Fornitore obbligatorio;
- Location obbligatoria;
- Data documento / Serie / Numero;
- blocco documento fornitore separato;
- nessuna Causale.

## HDR-008 — Ordine fornitore Location specifica

Atteso:

- giacenze della sede scelta;
- nessun significato "destinazione fisica definitiva".

## HDR-009 — Ordine fornitore Tutte

Atteso:

- scope esplicito;
- nessuna Location fittizia;
- stato distinto da "nessuna scelta";
- solo Location autorizzate nel calcolo;
- Serie globali disponibili.

## HDR-010 — Preventivo/Ordine cliente/DDT/Proforma/Fattura

Atteso:

- Cliente obbligatorio;
- Location obbligatoria;
- salvataggio respinto se manca uno dei due.

## HDR-011 — Banco

Atteso:

- Location obbligatoria;
- Cliente facoltativo.

## HDR-012 — Trasferimento

Atteso:

- origine + destinazione obbligatorie e distinte;
- numerazione comune.

## HDR-013 — Registrazione fattura fornitore

Atteso:

- Fornitore obbligatorio;
- nessuna Location;
- Data registrazione / Serie / Numero;
- N. fattura / Data fattura separati.

## HDR-014 — Corrispettivo manuale

Atteso:

- testata minimale;
- Location obbligatoria;
- Data;
- Numero automatico;
- nessuna Serie.

---

# 26. Campi legacy / da ritirare

Queste decisioni sono funzionali; la rimozione tecnica va preceduta da un censimento dei consumer, ma non esiste un requisito di compatibilità con dati reali storici.

## Arrivo merce

Ritirare:

- Causale.

## Ordine fornitore

Ritirare:

- Rif. ordine fornitore;
- Consegna prevista;
- conferma/documento esterno del fornitore;
- vecchia semantica di `destinationLocationId`.

Non mantenere questi campi in UI per il solo fatto che esistono nel database.

---

# 27. Regole da non reintrodurre

Non:

- usare `null` come sinonimo di "Tutte";
- creare una Location fittizia "Tutte";
- selezionare automaticamente la prima Location;
- selezionare automaticamente l'unica Location;
- partizionare il progressivo per Location;
- duplicare il blocco Serie/Numero per documento;
- chiamare "destinazione merce" la Location dell'Ordine fornitore;
- mantenere campi legacy dell'Ordine fornitore senza requisito;
- reintrodurre Causale nell'Arrivo merce;
- imporre la testata standard completa al Corrispettivo manuale;
- confondere Data registrazione e Data fattura nella Registrazione fattura fornitore.

---

# 28. Verifica tecnica prima dell'implementazione

Prima di modificare le testate:

1. censire componenti comuni già esistenti;
2. censire ogni consumer Location/Serie/Numero;
3. verificare API e backend permission gate sulle Location;
4. verificare il legame Location ↔ Serie;
5. verificare i campi legacy dell'Ordine fornitore;
6. verificare la Causale Arrivo merce;
7. verificare desktop/mobile;
8. aggiungere test HDR-*;
9. distinguere sempre requisito, comportamento osservato e causa tecnica;
10. non fare refactor massivi senza checkpoint per documento.

---

# 29. Fonti correlate

Da usare insieme a questa specifica:

- `VestiFlow_Contesto_Master_Progetto.docx`
- `CONTRATTO-COMUNE-DOCUMENTI.md`
- `03-specifica-unificazione-righe-documento.md`
- `04-specifica-numerazione-documenti.md`
- specifiche dei singoli documenti
- `12-specifica-collegamenti-documentali.md`
- specifica Pagamenti/Tesoreria

Questa specifica governa la **testata**; non duplica le regole di riga, movimenti, Includi/Genera o Pagamenti.
