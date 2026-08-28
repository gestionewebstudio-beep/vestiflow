# 14 · Elenchi, riepiloghi e griglie — contratto normativo comune

**Versione:** 1.0-r2  
**Data:** 28/08/2026  
**Stato:** candidata da approvare  
**Sostituisce dopo approvazione:** `docs/14-specifica-elenchi-documenti.md`  
**Fonti:** decisioni confermate dall’owner; audit tecnico `docs/15b-audit-elenchi-esito.md`  
**Natura:** specifica normativa. Non è un audit, un diario dei commit o una fotografia del codice.

> Questa riscrittura elimina la stratificazione della versione precedente.  
> Dove le fonti precedenti sono incompatibili e non esiste una decisione successiva certa, il punto resta esplicitamente rinviato: non viene completato per analogia.

---

## 1. Scopo

Questa specifica definisce il contratto comune di VestiFlow per:

- pagine elenco;
- riepiloghi operativi;
- apertura delle righe;
- selezione;
- barra delle azioni;
- griglie tabellari desktop;
- resa mobile delle righe di riepilogo;
- colonne;
- ordinamento;
- ridimensionamento;
- footer e metriche riepilogative;
- coerenza fra UI, stampa ed export.

L’obiettivo è condividere l’infrastruttura senza fondere domini differenti.

```text
infrastruttura comune
≠ riga universale
≠ colonna universale
≠ metrica universale
≠ formula universale
```

Il codice corrente descrive il comportamento osservato. La regola richiesta è quella di questa specifica e delle specifiche di modulo richiamate.

---

## 2. Famiglie di elenco

### 2.1 Elenchi documentali

Comprendono i record locali con identità documentale, numero o riferimento, data, soggetto e valori propri del documento, quando previsti.

Rientrano nella famiglia:

- Preventivo;
- Proforma;
- Documento di trasporto;
- Fattura;
- Fattura accompagnatoria;
- Nota di credito;
- Arrivo merce;
- Registrazione fattura fornitore;
- Trasferimento;
- Rettifica;
- Vendita e Reso al banco;
- Ordine cliente manuale;
- Ordine fornitore;
- altri documenti locali dotati di elenco e maschera operativa.

La Registrazione fattura fornitore appartiene agli elenchi documentali. Nel futuro Registro Pagamenti/Tesoreria potrà comparire anche la posizione finanziaria derivata, ma quella è una prospettiva diversa.

### 2.2 Stati funzionali: solo i due Ordini

Hanno stati funzionali soltanto:

- **Ordine cliente**: Confermato, Concluso, Annullato;
- **Ordine fornitore**: Confermato, Concluso, Annullato.

Gli stati dei due Ordini servono esclusivamente alla gestione dei collegamenti documentali **Includi/Genera**.

Non hanno stati funzionali:

- Preventivo;
- Proforma;
- Documento di trasporto;
- Fattura;
- Fattura accompagnatoria;
- Nota di credito;
- Arrivo merce;
- Registrazione fattura fornitore;
- Trasferimento;
- Rettifica;
- Vendita e Reso al banco;
- gli altri documenti locali, salvo futura decisione esplicita.

Questa specifica non autorizza:

- una colonna **Stato** generica su tutti i documenti;
- filtri di stato generici;
- azioni basate su uno stato tecnico presente nel codice;
- l’uso dello stato come criterio di routing, modifica, salvataggio o eliminazione.

La disciplina di Confermato/Concluso/Annullato dei due Ordini appartiene a `12-specifica-collegamenti-documentali.md` e alle rispettive specifiche di modulo.

### 2.3 Registri economici

Il Registro Corrispettivi è un registro economico derivato che unisce più origini.

La sua riga:

- non è una riga documento universale;
- può avere un identificativo composto;
- mantiene riferimenti diversi secondo l’origine;
- applica metriche e segni economici propri.

### 2.4 Movimenti

I Movimenti di magazzino sono eventi fisici.

Espongono almeno, quando disponibili:

- quantità;
- direzione;
- data;
- Location;
- origine;
- documento e riga sorgente.

Non assumono lo stato o la semantica economica di un documento.

### 2.5 Anagrafiche

Prodotti, Clienti e Fornitori possono adottare la stessa infrastruttura di griglia, colonne e ordinamento.

Restano però entità anagrafiche con:

- azioni proprie;
- filtri propri;
- colonne proprie;
- metriche proprie o nessun footer.

### 2.6 Report e analisi

Report, Analytics, Giacenze e Situazione mantengono perimetri e formule specifiche.

Non vengono fusi in un riepilogo universale.

### 2.7 Esclusioni

Non entrano automaticamente in questo contratto:

- lookup/scanner a risultato singolo;
- maschere di inserimento;
- griglie delle righe documento;
- sessioni di Inventario fisico, finché non è approvata la specifica dedicata.

---

## 3. Vocabolario obbligatorio

VestiFlow distingue tre funzioni.

| Funzione       | Significato                                                      |
| -------------- | ---------------------------------------------------------------- |
| **Modifica**   | apertura della maschera operativa del record                     |
| **Dettaglio**  | consultazione separata dalla maschera operativa                  |
| **Stampa/PDF** | rappresentazione destinata alla stampa o a un output equivalente |

Il termine **Anteprima** non sostituisce **Dettaglio**.

La resa di stampa non è il Dettaglio.

---

## 4. Apertura delle righe

### 4.1 Documenti locali

Per ogni documento locale dotato di maschera operativa:

```text
clic o tap sulla riga
→ maschera propria di Modifica
```

La decisione di routing non riceve e non legge uno stato documentale.

Per i due Ordini:

```text
Ordine cliente manuale
→ Modifica

Ordine fornitore
→ Modifica
```

Confermato, Concluso e Annullato non cambiano la destinazione.

### 4.2 Shopify e origini possedute dal canale

Gli ordini e le vendite posseduti da Shopify restano read-only in VestiFlow.

```text
Ordine Shopify online/POS
→ consultazione read-only
→ mai Modifica gestionale
```

La decisione dipende dall’origine/ownership, non dallo stato.

Distinguere sempre:

```text
Ordine cliente manuale VestiFlow  → Modifica
Ordine Shopify online/POS         → consultazione read-only
Vendita al banco VestiFlow        → Modifica
```

La Vendita al banco locale non è un Ordine Shopify POS.

### 4.3 Dettaglio

Il Dettaglio è un’azione separata.

Il lavoro su elenchi e routing non deve:

- eliminare le rotte Dettaglio esistenti;
- rinominare il Dettaglio in Stampa;
- usare il Dettaglio come destinazione primaria della riga locale;
- creare un falso Dettaglio che apre la stessa Modifica con un nome diverso.

Quando un Dettaglio dedicato non esiste, il gap resta dichiarato. Non si inventa una destinazione.

Il ridisegno dei componenti Dettaglio è un intervento successivo.

### 4.4 Permessi e feature gate

Routing, permessi e feature gate sono dimensioni distinte.

- il routing individua la destinazione canonica;
- i permessi stabiliscono se l’utente può consultare o gestire;
- il feature gate stabilisce se il modulo è disponibile;
- il frontend non sostituisce i controlli API.

Non usare uno stato dei due Ordini come surrogato del permesso.

### 4.5 Parità fra punti di ingresso

Per lo stesso record e lo stesso utente, quando il contesto di autorizzazione è equivalente:

```text
clic di riga
ricerca globale
link trasversale
→ stessa destinazione canonica
```

La destinazione non deve essere cablata separatamente nei consumer.

### 4.6 Gesti esclusi

Non usare:

- doppio clic;
- doppio tap;
- primo clic che seleziona e secondo che apre;
- long-press come unico modo di selezionare.

---

## 5. Selezione

### 5.1 Gesti distinti

```text
clic sulla riga      → apertura secondo il dominio
clic sulla checkbox  → selezione/deselezione senza navigazione
```

La checkbox ferma la propagazione dell’evento di riga.

### 5.2 Selezione multipla sempre disponibile

Negli elenchi e nei riepiloghi coperti da questa specifica, la selezione è una capacità comune, visibile e stabile.

```text
checkbox di riga      → seleziona/deseleziona
checkbox di testata   → applica il contratto comune di selezione generale
clic sulla riga       → apertura prevista dal dominio
```

Regole:

- la colonna checkbox resta visibile anche quando, nella prima versione della pagina, le funzioni disponibili sono poche;
- la selezione supporta più righe;
- la presenza della checkbox non dipende dal numero attuale di azioni;
- nuove funzioni possono essere aggiunte nel tempo senza cambiare la grammatica dell’elenco;
- selezione e apertura restano due gesti distinti;
- lookup, scanner e risultati singoli esclusi dal perimetro degli elenchi non sono obbligati a mostrare la checkbox.

Eventuali modalità tecniche interne come `none`, `single` e `multiple` non costituiscono la policy funzionale degli elenchi VestiFlow e non devono produrre differenze visive fra riepiloghi equivalenti.

### 5.3 Identità

La selezione conserva identificativi canonici, non riferimenti al DOM.

Per registri che uniscono origini differenti, l’identità deve restare non ambigua e includere l’origine quando necessario.

### 5.4 Selezione e cambio dataset

Nel comportamento ordinario, la selezione non deve lasciare record invisibili o non più appartenenti al risultato corrente.

Una selezione che attraversa pagine o filtri per comporre un nuovo documento è una policy specifica del modulo e deve essere dichiarata. Non si nasconde nella primitiva comune.

### 5.5 Riga selezionata

La riga selezionata usa un leggero cambio di sfondo comune.

Il cursore/segno di apertura compare soltanto dove la riga apre realmente una destinazione.

Apertura, Dettaglio e Selezione restano capacità distinte.

---

## 6. Barra delle azioni

### 6.1 Riga delle funzioni stabile

Ogni elenco o riepilogo coperto da questa specifica dispone di una riga stabile destinata alla selezione e alle funzioni applicabili.

La struttura della pagina è:

```text
filtri e strumenti dell’elenco
righe o card
riga delle funzioni sulla selezione
totali / footer
```

La riga delle funzioni:

- si trova alla fine delle righe e immediatamente sopra i totali;
- resta nello stesso punto con zero, una o più righe selezionate;
- può mostrare il conteggio della selezione;
- può accogliere progressivamente più funzioni senza cambiare la struttura della pagina;
- non viene spostata nella testata;
- non compare e scompare in base alla selezione;
- non diventa una barra fissa in fondo allo schermo.

La selezione può cambiare:

- ambito;
- abilitazione;
- conteggio;
- testo contestuale.

Non deve cambiare la posizione dei comandi.

Un’azione può essere:

- dichiarata e attiva;
- dichiarata ma disabilitata, con motivo accessibile;
- non prevista e quindi non dichiarata.

Non usare un generico stato `visible = false` per nascondere azioni che appartengono alla pagina.

Il contenuto preciso della riga resta specifico del modulo; la sua presenza e posizione sono comuni.

### 6.2 Arità

Il contratto comune usa:

| `requires`  |       0 selezionati |      1 |           2+ |
| ----------- | ------------------: | -----: | -----------: |
| `none`      | attiva sul filtrato | attiva |       attiva |
| `one`       |        disabilitata | attiva | disabilitata |
| `oneOrMore` |        disabilitata | attiva |       attiva |

I motivi standard di disabilitazione appartengono al componente comune.

Un vincolo di dominio può fornire una motivazione più specifica.

### 6.3 Ambito dell’azione

Quando l’azione supporta il risultato filtrato:

```text
0 selezionati → intero risultato corrente dei filtri
1+ selezionati → soltanto gli elementi selezionati
```

La selezione prevale sui filtri.

`filtered` non significa «righe attualmente caricate».

Su un elenco paginato o remoto, l’azione deve usare un endpoint che conosce l’intero filtro. Non deve processare soltanto la pagina visibile fingendo di aver processato il risultato.

Se l’endpoint filtrato non esiste ancora, l’azione dichiara `oneOrMore` e richiede una selezione. Non si finge una capacità non implementata.

### 6.4 Stampa, Excel ed Esporta

Sono tre azioni distinte.

| Azione      | Contratto                                             |
| ----------- | ----------------------------------------------------- |
| **Stampa**  | produce una rappresentazione stampabile               |
| **Excel**   | produce un foglio compatibile con Excel               |
| **Esporta** | produce i formati o tracciati dichiarati dalla pagina |

Excel non è un CSV rinominato.

Il contenuto di **Esporta** resta specifico del modulo.

### 6.5 Permesso Esporta

Ogni azione **Esporta** richiede `reports.export`, oltre al diritto di vedere i dati.

Il controllo deve esistere anche lato API.

Il permesso dell’azione **Excel** non viene dedotto automaticamente: deve essere dichiarato dalla specifica della pagina.

### 6.6 Comandi disabilitati

Quando un’azione disabilitata deve spiegare il motivo:

- il comando resta raggiungibile da tastiera;
- usa `aria-disabled`;
- il click viene bloccato dal componente;
- la motivazione è unica e raggiungibile con mouse e focus.

Non applicare questo pattern a ogni pulsante disabilitato dell’app: è specifico dei comandi che devono spiegarsi.

### 6.7 Mobile

Su schermi stretti la stessa sequenza resta:

```text
filtri
card
riga delle funzioni
totali
```

La riga delle funzioni si trova dopo le card e prima dei totali.

I comandi possono essere raccolti in menu nominati quando lo spazio non consente di mostrarli tutti.

Non usare un overflow anonimo `···` come unica casa delle funzioni principali.

La riga delle funzioni non diventa una barra fissa in fondo allo schermo.

---

## 7. Motore griglia comune

### 7.1 Adottare, non ricostruire

L’audit tecnico ha rilevato che esistono già:

- `DataTableComponent`;
- `TableColumnResizeDirective`;
- `TableColumnPreferenceService`;
- `TableColumnPickerComponent`;
- `DataTableSort[]`;
- comparatori condivisi;
- mixin comuni per pagine elenco e tabelle.

Prima di creare un nuovo motore, una nuova direttiva o un nuovo servizio, verificare il riuso di quelli esistenti.

### 7.2 Responsabilità comune

Per i consumer migrati, l’infrastruttura comune governa almeno:

- impalcatura `thead`/`tbody`;
- colonne visibili;
- selezione multipla;
- sezioni;
- footer;
- ordinamento;
- ridimensionamento;
- accessibilità della testata;
- emissione degli eventi di riga;
- posizione della riga delle funzioni;
- grammatica visiva e interattiva dei filtri, dell’ordinamento e del comando Colonne.

Non deve restare una seconda tabella che replica lo stesso comportamento.

La collocazione tecnica di filtri e strumenti — shell, mixin o componente dedicato — va scelta dopo l’ispezione del codice esistente. La regola funzionale è che la loro grammatica resti comune.

### 7.3 Responsabilità di famiglia

Restano nella pagina o configurazione di famiglia:

- contenuto delle celle;
- badge;
- icone;
- link;
- tipografia specifica motivata dal dominio;
- campi e valori concreti dei filtri;
- azioni concrete;
- metriche;
- segno economico;
- destinazioni;
- eventuale resa mobile specifica motivata dal dominio.

La struttura, la posizione e il comportamento visivo dei filtri e dell’ordinamento seguono invece la grammatica comune.

Il motore comune non contiene rami di dominio come:

```text
se Fattura...
se Movimento...
se Corrispettivo...
```

### 7.4 Rendering delle celle

Le celle speciali usano template proiettati e tipizzati per colonna.

Non trasformare badge, link o contenuti strutturati in stringhe soltanto per inserirli nel motore.

### 7.5 Sezioni

Il motore supporta:

- intestazione di sezione opzionale;
- righe;
- footer opzionale.

Una tabella piatta è una sola sezione senza intestazione e senza footer.

I subtotali del Registro Corrispettivi arrivano dalla fonte canonica e non vengono ricalcolati dal motore.

---

## 8. Famiglie e configurazioni

### 8.1 Nessuna riga universale

Il riuso dell’infrastruttura non autorizza a fondere:

- documento;
- evento economico;
- movimento fisico;
- anagrafica;
- report.

Ogni famiglia mantiene:

- modello riga;
- colonne;
- filtri;
- metriche;
- azioni;
- destinazioni.

### 8.2 Registrazione fattura fornitore

Appartiene agli elenchi documentali, ma configura colonne proprie.

Esempi di dati pertinenti:

- Data registrazione;
- Numero registrazione;
- Fornitore;
- N. fattura fornitore;
- Data fattura;
- Totale;
- pagamento/saldo, quando previsto.

La Location non diventa una colonna obbligatoria per analogia.

### 8.3 Corrispettivi

Il Registro Corrispettivi mantiene:

- raggruppamento per giornata;
- subtotali canonici;
- identità per origine;
- card mobile specifica.

Non viene migrato meccanicamente al motore se la migrazione perde la resa mobile o gli stili della feature.

### 8.4 Movimenti

I Movimenti mantengono:

- quantità;
- tipo;
- origine;
- documento sorgente;
- Location;
- descrizioni e codici pertinenti.

Non ricevono colonne economiche o stati documentali per analogia.

---

## 9. Grammatica visiva e interattiva dei riepiloghi

Il Registro Corrispettivi è il riferimento visivo e interattivo degli elenchi e dei riepiloghi VestiFlow.

Il riferimento comprende:

- barra e disposizione dei filtri;
- rappresentazione dei filtri applicati;
- grammatica dell’ordinamento;
- comando Colonne;
- densità della tabella desktop;
- card mobile;
- riga delle funzioni dopo le righe;
- totali finali.

Il Registro Corrispettivi non diventa il modello dati universale: colonne, filtri concreti, azioni e metriche restano specifici della famiglia.

Le decisioni visive confermate sono:

| Elemento           | Regola                                                  |
| ------------------ | ------------------------------------------------------- |
| corpo              | `12px` / `--text-xs`                                    |
| padding celle      | `4px × 12px`                                            |
| altezza testata    | `32px` dichiarati                                       |
| intestazioni       | maiuscole con tracking                                  |
| divisori verticali | assenti                                                 |
| contrasto testata  | token dedicati ad alto contrasto                        |
| numeri             | allineati; cifre tabulari dove opportuno                |
| filtri             | stessa grammatica visiva e di disposizione del Registro |
| ordinamento        | stessa grammatica visiva e interattiva già definita     |
| riga funzioni      | dopo le righe, prima dei totali                         |

Una differenza resta locale soltanto se motivata dal dominio.

Non creare custom property per conservare divergenze accidentali.

Ogni promozione grafica comune richiede verifica visiva sui consumer già migrati.

---

## 10. Colonne e ridimensionamento

### 10.1 Visibilità e preset

Si persistono per utente × tenant × vista:

- preset scelto;
- colonne visibili.

Non si persistono, salvo futura decisione esplicita:

- larghezze manuali;
- ordinamento corrente;
- ordine manuale delle colonne.

### 10.2 Resize

Il resize usa la direttiva comune ed è temporaneo nella sessione della pagina.

Non creare un secondo meccanismo locale.

### 10.3 Comportamento della colonna stretta — non consolidato

Le fonti precedenti contengono decisioni incompatibili fra:

- `table-layout: auto`;
- `table-layout: fixed`;
- clipping senza ellissi;
- troncamento con ellissi;
- larghezze iniziali dichiarate;
- dimensionamento sul contenuto.

Questa versione non sceglie una delle alternative.

Fino a una decisione visiva dedicata:

- preservare il comportamento corrente del consumer;
- non introdurre una regola globale `auto` o `fixed`;
- non eliminare `truncate`;
- non aggiungere larghezze iniziali o `min-width` per analogia;
- non modificare insieme più riepiloghi su questo punto.

La decisione dovrà essere verificata su dati reali e su almeno due consumer.

---

## 11. Ordinamento

### 11.1 Contratto unico

`DataTableSort[]` è l’unica grammatica di ordinamento.

Query param, DTO ed endpoint sono serializzazioni dello stesso contratto.

### 11.2 Più chiavi

L’ordinamento supporta più chiavi:

```text
assente     → primaria crescente
crescente   → primaria decrescente
decrescente → rimossa; le altre restano
```

Premere una chiave secondaria la promuove a primaria.

### 11.3 Accessibilità

- `aria-sort` soltanto sulla chiave primaria;
- direzione e priorità delle chiavi secondarie nel nome accessibile;
- numero della priorità visibile soltanto con almeno due chiavi.

### 11.4 Valore canonico

L’ordinamento usa valori canonici, non il testo formattato della cella.

Esempi:

- data ISO/timestamp;
- quantità numerica col proprio segno;
- importo numerico;
- etichetta mostrata per categorie presentate all’utente con un nome.

### 11.5 Dataset completo

- riepilogo che carica tutto il filtrato → ordinamento client-side ammesso;
- elenco paginato/remoto → ordinamento API sull’intero filtrato;
- vietato ordinare soltanto la pagina visibile fingendo di aver ordinato tutto.

### 11.6 Persistenza

L’ordinamento è temporaneo.

Alla riapertura la pagina torna al proprio ordinamento predefinito.

### 11.7 Export

Un export descritto come **vista corrente** deve rispettare:

- filtri;
- ordinamento;
- scope tenant/Location;
- colonne previste dal contratto dell’azione.

Un tracciato differente deve dichiararlo esplicitamente.

---

## 12. Riepiloghi operativi

### 12.1 Perimetro

Questa sezione vale per le pagine classificate come **riepiloghi operativi**.

Non si applica automaticamente a:

- anagrafiche;
- form;
- lookup;
- report analitici con contratto proprio.

### 12.2 Periodo e paginazione

Per i riepiloghi operativi:

- nessuna paginazione visibile;
- apertura predefinita sugli ultimi 30 giorni;
- voce esplicita **Tutti**;
- nessun tetto arbitrario sul numero di righe;
- il contenimento iniziale è il periodo;
- con periodo applicato, le date effettive sono nell’URL;
- scegliendo **Tutti**, le date vengono rimosse dall’URL.

### 12.3 Giorni civili

Il filtro è inclusivo sugli estremi e deve rappresentare gli stessi giorni civili in UI e API.

L’unificazione dei motori Periodo richiede prima la verifica delle differenze fra ora locale e UTC.

Non scegliere una semantica osservando quale implementazione è più frequente.

---

## 13. Footer, metriche e segno economico

### 13.1 Contenitore comune, metriche specifiche

Il contenitore grafico e accessibile del footer può essere comune.

Le metriche restano specifiche della famiglia o della vista.

Esempi:

- documenti: aggregazioni documentali approvate;
- Registrazione fattura fornitore: valori del documento e posizione di saldo, quando prevista;
- Corrispettivi: vendite, rettifiche e corrispettivo;
- Movimenti: quantità entrata/uscita soltanto se approvate;
- anagrafiche: metriche proprie o nessun footer.

Non introdurre una metrica perché il contenitore la supporta.

### 13.2 Nessun secondo motore economico

Un riepilogo:

- legge valori canonici persistiti;
- applica filtri;
- applica il verso previsto;
- aggrega;
- non ricalcola prezzi;
- non ricalcola sconti;
- non ricalcola IVA;
- non rivaluta lo storico col listino o col prezzo corrente.

Se manca il valore canonico necessario, dichiarare il gap. Non sostituirlo con un dato anagrafico attuale.

### 13.3 Contratto del segno

Il verso economico deriva dal tipo o dall’evento, non da uno stato.

Regole già confermate:

```text
Fattura                  → positivo
Fattura accompagnatoria  → positivo
Nota di credito          → negativo
Vendita al banco         → positivo
Reso al banco            → negativo
Vendita online           → positivo
Rimborso online          → negativo
```

La stessa autorità del segno deve essere usata da:

- totale della selezione;
- footer;
- stampa elenco;
- CSV;
- Excel;
- report equivalenti.

Caso di accettazione:

```text
Fattura 100,00 + Nota di credito 30,00 = 70,00
Vendita 100,00 + Reso 30,00 = 70,00
```

La definizione tecnica completa viene consolidata nella specifica dedicata al segno economico.

### 13.4 Coerenza UI/export

Non sono ammessi risultati divergenti sullo stesso insieme:

```text
UI      = 70
CSV     = 130
Stampa  = 130
```

### 13.5 Scope tenant e Location

Un export deve rispettare lo stesso perimetro tenant, utente e Location della vista.

Il permesso di export non amplia il perimetro dei dati visibili.

---

## 14. Mobile

### 14.1 Riepiloghi

La card del Registro Corrispettivi è il riferimento mobile iniziale dei riepiloghi.

- gerarchia chiara;
- parole a sinistra e numeri a destra quando coerente;
- chevron = navigazione;
- nessun chevron su una riga non apribile;
- nessuna espansione implicita della riga di riepilogo.

Una pagina può proiettare una card specifica quando il fallback generico perde il significato.

### 14.2 Righe documento

La card delle righe documento è un componente distinto.

```text
card riepilogo        → consultazione/navigazione
card riga documento   → compilazione/espansione campi
```

Non unificare i due pattern.

### 14.3 Una sola rappresentazione attiva

Su una determinata viewport la stessa riga non deve esistere in due DOM attivi.

Desktop e mobile sono due rappresentazioni dello stesso stato, non due copie funzionali.

---

## 15. Accessibilità

- checkbox native o equivalenti pienamente accessibili;
- focus visibile;
- apertura da tastiera coerente col clic;
- checkbox e comandi interni non propagano l’apertura della riga;
- motivi delle azioni disabilitate raggiungibili anche da tastiera;
- nessuna funzione essenziale soltanto hover;
- intestazioni di ordinamento con nome accessibile completo;
- numeri non comunicati soltanto tramite colore;
- almeno un test con una riga reale per ogni elenco migrato.

---

## 16. Metodo di adozione

### 16.1 Un consumer alla volta

Per ogni consumer:

1. leggere la specifica della famiglia;
2. ispezionare il markup e i servizi reali;
3. classificare differenze comuni e di dominio;
4. migrare il comportamento comune;
5. conservare celle, filtri, azioni e metriche specifiche;
6. testare almeno una riga reale;
7. verificare desktop e mobile;
8. rimuovere l’implementazione parallela;
9. fermarsi per review quando il rischio è trasversale.

### 16.2 Verifica visiva obbligatoria

Lint, build e test verdi non dimostrano che una tabella sia visivamente corretta.

Verificare almeno:

- intestazioni;
- densità;
- colonne lunghe;
- righe con badge e link;
- selezione;
- footer;
- card mobile;
- stato vuoto;
- caricamento;
- errore.

### 16.3 Shell e filtri

Il mixin grafico comune non equivale a un componente shell completo.

Non creare un mega-componente per titolo, filtri, azioni e tabella prima di avere almeno due consumer reali con markup e comportamento equivalenti.

---

## 17. Criteri di accettazione

### 17.1 Routing

- ogni documento locale con form apre la propria Modifica;
- il routing non accetta né legge uno stato;
- Ordine cliente manuale → Modifica;
- Ordine fornitore → Modifica;
- Ordine Shopify online/POS → consultazione read-only;
- Vendita al banco locale → Modifica;
- ricerca globale e riga usano la stessa autorità;
- il Dettaglio resta separato.

### 17.2 Stati

- soltanto Ordine cliente e Ordine fornitore espongono stati funzionali;
- nessun altro documento riceve colonna/filtro/azione Stato per analogia;
- gli stati dei due Ordini non cambiano routing, Modifica, Salva o Elimina;
- l’eleggibilità Includi/Genera è verificata nelle specifiche dedicate, non in questa.

### 17.3 Selezione e azioni

- checkbox visibile su ogni elenco e riepilogo coperto dalla specifica;
- checkbox separata dalla riga;
- selezione multipla;
- niente doppio clic;
- nessuna selezione invisibile;
- riga delle funzioni presente dopo le righe e prima dei totali;
- riga delle funzioni stabile con zero, una o più selezioni;
- `requires` rispettato;
- scope filtrato solo dove l’endpoint lo supporta;
- motivi accessibili;
- `reports.export` verificato lato UI e API.

### 17.4 Griglia

- nessun secondo `thead`/`tbody` nei consumer migrati;
- colonne, selezione, sort e resize usano l’infrastruttura comune;
- filtri, ordinamento, riga funzioni e totali seguono la grammatica dei Corrispettivi;
- celle di dominio conservano badge, link e tipografia;
- test con almeno una riga reale;
- verifica visiva desktop/mobile.

### 17.5 Ordinamento

- più chiavi;
- valori canonici;
- intero risultato filtrato;
- nessun comando inerte;
- export coerente quando dichiara la vista corrente.

### 17.6 Riepiloghi economici

- valori persistiti;
- verso centralizzato;
- Nota di credito e Reso sottraggono;
- UI, selezione, footer, stampa ed export coincidono;
- nessuna rivalutazione con prezzi correnti.

### 17.7 Sicurezza e perimetro

- tenant e Location rispettati;
- permessi API invariati o rafforzati;
- nessun effetto su stock, movimenti, IVA o pagamenti durante un refactor di elenco.

---

## 18. Decisioni rinviate

Restano fuori e non autorizzano deduzioni:

- comportamento delle azioni massive su selezioni eterogenee;
- esiti parziali delle azioni massive;
- menu Stampa con Documento / Documenti selezionati / Elenco;
- rifacimento dei componenti Dettaglio;
- nuovo Dettaglio del Corrispettivo manuale;
- migrazione completa del Registro Corrispettivi al motore;
- selezione persistente per flussi compositivi;
- specifica completa di Giacenze e Situazione;
- specifica Inventario fisico semplice;
- semantica unica UTC/ora locale del motore Periodo;
- comportamento globale della colonna stretta (`auto`/`fixed`, clipping/ellissi, larghezze iniziali).

---

## 19. Fonti e sostituzione

### 19.1 Fonte normativa

Dopo approvazione, questo documento è la fonte comune per:

- routing degli elenchi;
- selezione;
- azioni elenco;
- motore griglia;
- colonne;
- ordinamento;
- resize;
- riepiloghi;
- footer;
- mobile dei riepiloghi.

La specifica `12-specifica-collegamenti-documentali.md` resta la fonte per:

- Includi;
- Genera;
- stati dei due Ordini;
- eleggibilità delle sorgenti;
- consumo e collegamenti.

### 19.2 Audit tecnico

`docs/15b-audit-elenchi-esito.md` resta una fotografia tecnica datata e una fonte di file e simboli.

Non è normativa e non autorizza automaticamente il piano proposto.

### 19.3 Documento precedente

La versione precedente viene archiviata perché mescola:

- decisioni;
- audit;
- cronologia;
- commit;
- proposte;
- sezioni ritirate;
- contraddizioni.

Non deve restare come fonte concorrente con lo stesso nome.

---

## 20. Sintesi vincolante

```text
DOCUMENTO LOCALE CON FORM
  riga → Modifica

ORDINE CLIENTE MANUALE
  riga → Modifica
  stato → solo collegamenti Includi/Genera

ORDINE FORNITORE
  riga → Modifica
  stato → solo collegamenti Includi/Genera

ORDINE SHOPIFY ONLINE/POS
  riga → consultazione read-only

DETTAGLIO
  azione separata

CHECKBOX
  sempre visibile negli elenchi e riepiloghi coperti
  selezione multipla senza navigazione

RIGA FUNZIONI
  dopo le righe
  prima dei totali
  posizione stabile

GRAMMATICA VISIVA
  riferimento = Registro Corrispettivi
  filtri · ordinamento · colonne · card · totali

GRIGLIA
  infrastruttura comune
  contenuti e metriche per famiglia

RIEPILOGO
  valori persistiti
  verso per tipo/evento
  nessun ricalcolo economico

ORDINAMENTO
  più chiavi
  dataset completo
  temporaneo

COLONNE
  preset e visibilità persistiti
  resize temporaneo
  comportamento stretto da decidere
```
