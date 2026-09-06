# 15c · Contratto del segno economico nei riepiloghi

**Versione:** 1.0-r1  
**Data:** 28/08/2026  
**Stato:** candidata normativa da approvare  
**Ambito:** riepiloghi che aggregano documenti o eventi di verso economico opposto  
**Fonte funzionale:** decisioni confermate dall’owner  
**Fonte tecnica:** `docs/15b-audit-elenchi-esito.md` e ispezione B1 completata il 28/08/2026  
**Sostituisce dopo approvazione:** ogni regola locale o somma cieca incompatibile sul segno economico

> Questa specifica disciplina soltanto il **verso economico nelle aggregazioni**.  
> Non introduce un nuovo motore economico, non ricalcola documenti e non modifica prezzi, sconti, IVA o arrotondamenti.

---

## 1. Scopo

Un documento o evento può conservare importi positivi e contribuire negativamente a un riepilogo.

La regola è:

```text
valore canonico persistito
× direzione economica del tipo
= contributo al riepilogo
```

Esempi obbligatori:

```text
Fattura 100,00 + Nota di credito 30,00 = 70,00

Vendita al banco 100,00 + Reso al banco 30,00 = 70,00
```

Un riepilogo:

- legge valori già persistiti;
- applica il verso;
- somma;
- non ricalcola il documento.

---

## 2. Concetti distinti

### 2.1 Valore persistito

È l’importo economico salvato sul documento o sull’evento canonico.

Per i documenti locali interessati da questa specifica:

- quantità e importi restano positivi;
- la Nota di credito non viene salvata con importi negativi;
- il Reso al banco non viene salvato con importi negativi.

L’ispezione ha verificato che il Reso al banco persiste il totale come somma positiva delle righe.

### 2.2 Direzione economica

È la proprietà del **tipo documento** che determina se il valore aumenta o diminuisce il riepilogo.

### 2.3 Contributo firmato

È il valore usato dall’aggregazione:

```text
direzione +1 → + importo persistito
direzione -1 → - importo persistito
```

La direzione economica non deriva:

- da uno stato;
- dal segno della quantità;
- dal segno già inserito dall’operatore;
- dal prezzo corrente dell’articolo;
- da un ricalcolo del documento.

---

## 3. Matrice normativa dei documenti locali

La prima autorità comune riguarda i documenti locali che oggi convivono negli stessi registri misti.

| Tipo documento          | Direzione |
| ----------------------- | --------: |
| Fattura                 |      `+1` |
| Fattura accompagnatoria |      `+1` |
| Nota di credito         |      `-1` |
| Vendita al banco        |      `+1` |
| Reso al banco           |      `-1` |

La mappa deve essere:

- esplicita;
- tipizzata;
- esaustiva per i tipi supportati;
- priva di un fallback silenzioso che assegni automaticamente `+1` a un nuovo tipo misto.

Un nuovo tipo che entra in un registro economico misto deve ricevere una direzione deliberata prima di essere aggregato.

---

## 4. Perimetro tecnico misurato

### 4.1 Profili realmente affetti oggi

Sono affetti due profili serviti da `DocumentListComponent`:

1. **Registro Fatture**
   - Fattura;
   - Fattura accompagnatoria;
   - Nota di credito.

2. **Registro Vendite al banco**
   - Vendita al banco;
   - Reso al banco.

Sono gli unici profili attuali che mescolano, nello stesso elenco, documenti locali con direzione positiva e negativa.

### 4.2 Consumer affetti

L’ispezione ha individuato:

- `document-list.component.ts`
  - totale economico della selezione;

- `document-list-export.util.ts`
  - accessori monetari usati dalla configurazione di ripiego;
  - footer CSV;
  - footer della stampa elenco;

- `list-export.util.ts`
  - primitiva condivisa che somma i valori ricevuti.

Fatture e Vendite al banco usano entrambe la configurazione di ripiego `GOODS_RECEIPT_LIST_EXPORT`; correggere i suoi accessori monetari copre i due casi di accettazione senza creare due regole.

### 4.3 Consumer non affetti oggi

Non devono essere modificati nella prima correzione B1:

- `sales-order-list.component.ts`;
- `sales-order-list-export.util.ts`;
- Ordini fornitore;
- Movimenti;
- Excel esistenti.

Motivo:

- `SalesOrder` non possiede un tipo di riga con verso opposto;
- il rimborso dell’Ordine cliente è oggi uno stato/evento associato, non una riga autonoma da sommare nel medesimo elenco;
- Ordini fornitore non mescola tipi di verso opposto;
- Movimenti non ha un footer monetario;
- gli Excel esistenti non aggregano oggi i due registri misti.

Il fatto che un secondo motore di export esista in `sales-order-list-export.util.ts` è un rischio architetturale, ma non autorizza a modificarlo senza un caso reale affetto.

---

## 5. Autorità minima del segno

La correzione non richiede un motore economico.

Richiede una funzione pura del dominio documentale, concettualmente equivalente a:

```text
documentEconomicSign(documentType) → +1 | -1
```

La funzione:

- riceve il tipo documento;
- restituisce soltanto la direzione;
- non legge righe;
- non legge prezzi;
- non legge IVA;
- non applica sconti;
- non arrotonda;
- non modifica il valore persistito.

La collocazione tecnica naturale è nel dominio documenti, vicino alle classificazioni dei tipi documentali.

Il nome concreto del simbolo può essere definito durante l’implementazione, purché esista una sola autorità per questa responsabilità.

---

## 6. Applicazione ai consumer

### 6.1 Totale della selezione

Il totale della selezione deve sommare contributi firmati:

```text
somma += segno(tipo) × totalePersistito
```

Caso:

```text
Fattura                  100,00
Nota di credito           30,00
Totale selezione          70,00
```

Caso:

```text
Vendita al banco         100,00
Reso al banco             30,00
Totale selezione          70,00
```

### 6.2 CSV e stampa elenco

La primitiva generica di export non deve conoscere i tipi documento.

L’accessore monetario della configurazione documentale le consegna un valore già firmato.

```text
configurazione documento
→ legge il valore persistito
→ applica documentEconomicSign(tipo)
→ consegna il Money firmato alla primitiva
```

La primitiva continua a:

- formattare;
- sommare;
- produrre footer;
- costruire CSV e stampa.

Non deve ricevere una seconda mappa del segno.

### 6.3 Subtotale, IVA e totale

Quando la configurazione esporta più grandezze monetarie, la stessa direzione deve essere applicata in modo coerente a:

- imponibile/subtotale persistito;
- IVA persistita;
- totale persistito.

Non ricalcolare:

```text
totale = imponibile + IVA
```

se quei valori sono già salvati.

Il verso viene applicato separatamente allo snapshot persistito di ciascuna grandezza.

---

## 7. Valore mostrato nella cella

Questa specifica disciplina le **aggregazioni** e non decide una nuova rappresentazione della singola cella.

Nella prima correzione B1:

- non cambiare il valore persistito;
- non trasformare automaticamente la cella in `-30,00`;
- non aggiungere quantità negative;
- non cambiare badge o tipo documento;
- non cambiare il formato della riga.

La decisione se una Nota di credito o un Reso debbano mostrare il segno meno anche nella cella è separata e non viene dedotta dal totale aggregato.

Il tipo documento continua a identificare la natura della riga.

---

## 8. Ordinamento

Questa specifica non modifica l’ordinamento della colonna economica.

Nella prima correzione B1:

- conservare l’ordinamento corrente sul valore canonico già usato dalla vista;
- non passare autonomamente a un ordinamento per contributo firmato;
- non introdurre un ordinamento per valore assoluto;
- non toccare `DataTableSort[]` o i comparatori.

L’eventuale scelta fra valore persistito e contributo firmato richiede una decisione distinta.

---

## 9. Corrispettivi

### 9.1 Comportamento osservato

Il Registro Corrispettivi produce già risultati con il verso corretto, ma lo fa in due modi:

1. **righe del registro**
   - il backend proietta Resi/Rimborsi con importi negativi;

2. **riepilogo**
   - il backend legge valori persistiti positivi e sottrae il totale delle rettifiche nella formula.

Le due implementazioni producono oggi lo stesso risultato.

Il riepilogo Corrispettivi:

- somma valori persistiti;
- non ricalcola prezzi;
- non ricalcola sconti;
- non ricalcola IVA;
- ricava l’imponibile netto dalle grandezze aggregate già disponibili.

### 9.2 Regola per il primo intervento

La correzione B1 dei documenti locali non deve modificare Corrispettivi.

In particolare:

- non applicare `documentEconomicSign` a righe già firmate;
- non moltiplicare una seconda volta un Reso/Rimborso negativo;
- non spostare la proiezione API;
- non riscrivere la formula del riepilogo;
- non cambiare il DTO.

Altrimenti:

```text
-30 × -1 = +30
```

e il verso verrebbe invertito due volte.

### 9.3 Consolidamento futuro

Il fatto che Corrispettivi esprima la stessa regola in due punti è un debito tecnico misurato.

La sua eventuale unificazione:

- richiede un intervento dedicato;
- deve attraversare API, DTO, righe, subtotali e riepilogo;
- non appartiene alla correzione B1;
- non può essere eseguita soltanto per riusare la funzione dei documenti locali.

---

## 10. Export

### 10.1 Due motori esistenti

L’ispezione ha confermato due motori distinti:

1. `list-export.util.ts`
   - usato dal registro documenti;
   - costruisce CSV e stampa elenco;
   - usa il footer `sumMoney`;

2. `sales-order-list-export.util.ts`
   - possiede `sumTotals`, serializzazione CSV e HTML propri;
   - non importa il primo motore.

Questa specifica non autorizza a fondere i due motori nel passaggio B1.

### 10.2 Excel

Gli Excel esistenti non sono coinvolti nei due registri misti attuali.

Non modificare:

- Excel Ordini fornitore;
- Excel Corrispettivi;
- generatori SpreadsheetML esistenti.

L’azione chiamata “Excel” che produce oggi un CSV resta un tema separato della specifica 14.

---

## 11. Valori mancanti

Se un documento non possiede uno snapshot economico necessario:

- non rileggere il prezzo dall’anagrafica;
- non usare il listino corrente;
- non ricostruire il totale da quantità × prezzo;
- non sostituire silenziosamente con zero.

Il consumer deve dichiarare il gap secondo il contratto della vista.

Questa specifica non decide se il comportamento debba essere warning, valore non determinato o blocco export per ogni singola pagina.

---

## 12. Test di accettazione

### 12.1 Funzione del segno

Verificare almeno:

```text
Invoice              → +1
InvoiceAccompanying  → +1
CreditNote           → -1
StoreSale            → +1
StoreReturn          → -1
```

Un tipo non classificato nel perimetro misto non deve ricevere silenziosamente una direzione per fallback.

### 12.2 Selezione — Registro Fatture

```text
Fattura                  100,00
Nota di credito           30,00
Totale selezione          70,00
```

### 12.3 Selezione — Vendite al banco

```text
Vendita al banco         100,00
Reso al banco             30,00
Totale selezione          70,00
```

### 12.4 CSV e stampa — Registro Fatture

Gli stessi due documenti devono produrre:

```text
Footer CSV                70,00
Footer stampa             70,00
```

Quando presenti:

```text
imponibile firmato
IVA firmata
totale firmato
```

devono essere coerenti fra loro senza essere ricalcolati.

### 12.5 CSV e stampa — Vendite al banco

Gli stessi due documenti devono produrre:

```text
Footer CSV                70,00
Footer stampa             70,00
```

### 12.6 Consumer invariati

Verificare che restino invariati:

- Ordini cliente;
- Ordini fornitore;
- Movimenti;
- Corrispettivi;
- Excel esistenti.

---

## 13. Test di falsificazione

Falsificare separatamente:

1. togliere il segno dal totale selezione:
   - deve fallire soltanto il test della selezione;

2. togliere il segno dagli accessori export:
   - devono fallire CSV e stampa;

3. rendere `CreditNote` positiva:
   - devono fallire Fatture;

4. rendere `StoreReturn` positiva:
   - devono fallire Vendite al banco;

5. applicare il segno ai Corrispettivi già firmati:
   - il test Corrispettivi deve rilevare il doppio segno;

6. rileggere un prezzo corrente al posto dello snapshot:
   - un test deve dimostrare che una modifica anagrafica non cambia lo storico.

Le prove devono distinguere i consumer. Un unico test che fallisce per ogni modifica non dimostra che l’autorità sia applicata correttamente in ciascun punto.

---

## 14. File del primo intervento B1

Perimetro tecnico atteso, da confermare sul codice prima della modifica:

```text
NUOVO
  domain/documents/models/document-economic-sign.util.ts
  domain/documents/models/document-economic-sign.util.spec.ts

MODIFICA
  features/documents/document-list.component.ts
  features/documents/utils/document-list-export.util.ts

TEST
  spec dei consumer effettivi di selezione, CSV e stampa
```

`list-export.util.ts` cambia soltanto se l’ispezione dimostra che il contratto generico deve ricevere o propagare il valore firmato; non deve contenere la conoscenza dei tipi documento.

Restano fuori:

```text
sales-order-list.component.ts
sales-order-list-export.util.ts
supplier-order-list-export.util.ts
movement-list-export.util.ts
corrispettivi
Excel
API
DB
migration
```

---

## 15. Rischi di regressione

1. **Doppio segno**
   - soprattutto sui Corrispettivi già firmati.

2. **Correzione di un solo consumer**
   - selezione corretta ma export ancora errato;
   - export corretto ma selezione ancora errata.

3. **Generalizzazione non necessaria**
   - applicare la funzione a Ordini o Movimenti che non mescolano versi.

4. **Ricalcolo mascherato**
   - usare quantità, prezzo o aliquota per costruire un valore che esiste già.

5. **Cambio non autorizzato delle celle**
   - mostrare importi negativi nelle righe senza decisione esplicita.

6. **Cambio non autorizzato dell’ordinamento**
   - ordinare per contributo firmato senza decisione.

7. **Fallback silenzioso**
   - un tipo nuovo entra in un registro misto come positivo senza essere classificato.

---

## 16. Fuori perimetro

Questa specifica non decide e non autorizza:

- calcolo del totale documento;
- calcolo del totale riga;
- sconto riga;
- sconto documento;
- ripartizione dello sconto;
- calcolo o ripartizione IVA;
- arrotondamenti;
- reverse charge;
- split payment;
- indetraibilità;
- regime del margine;
- totale documento contro totale dovuto;
- nuovi campi economici;
- migrazioni;
- ricalcolo dello storico;
- visualizzazione negativa della singola cella;
- ordinamento per contributo firmato;
- unificazione dei due motori export;
- riscrittura dei Corrispettivi.

---

## 17. Metodo per Claude Code

Prima di modificare:

1. leggere `docs/14-specifica-elenchi-documenti.md`;
2. leggere questa specifica;
3. usare `docs/15b-audit-elenchi-esito.md` come fotografia tecnica;
4. verificare di nuovo i consumer sul codice corrente;
5. dimostrare la causa radice;
6. elencare i file da modificare;
7. fermarsi se emerge un tipo o consumer non coperto.

Durante la modifica:

- un solo intervento B1;
- nessun refactor generale;
- nessuna API;
- nessun DB;
- nessuna modifica a Corrispettivi;
- nessun aggiornamento di prezzi o IVA;
- nessun push.

Dopo la modifica:

- diff isolato;
- test di accettazione;
- falsificazioni separate;
- conferma dei consumer non toccati;
- stop per review.

---

## 18. Sintesi vincolante

```text
VALORE PERSISTITO
  resta positivo

TIPO DOCUMENTO
  decide il verso

FATTURA / ACCOMPAGNATORIA
  +1

NOTA DI CREDITO
  -1

VENDITA AL BANCO
  +1

RESO AL BANCO
  -1

SELEZIONE / CSV / STAMPA
  stessa autorità del segno

CELLA
  non modificata da questa specifica

ORDINAMENTO
  non modificato da questa specifica

CORRISPETTIVI
  già firmati
  esclusi dal primo intervento

PREZZI / SCONTI / IVA
  mai ricalcolati
```
