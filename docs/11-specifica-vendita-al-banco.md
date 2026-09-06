# 11 · Vendita e Reso al banco — specifica funzionale consolidata

**Stato:** specifica corrente da usare in sostituzione della versione precedente  
**Data consolidamento:** 23/08/2026  
**Modulo:** Vendita al banco · Reso al banco  
**Perimetro:** comportamento funzionale, UI documentale, stock, Corrispettivi e integrazione con i contratti comuni VestiFlow

> **Questa versione sostituisce integralmente il precedente `11-specifica-vendita-al-banco.md`.**
> Le decisioni consolidate dall'owner fino al 23/08/2026 prevalgono su comportamenti osservati nel codice, audit, test esistenti e versioni precedenti incompatibili.

---

## 0. Regola di fondo

Vendita al banco e Reso al banco sono **documenti VestiFlow**.

Non devono avere una propria infrastruttura parallela per:

- righe documento;
- ricerca articolo;
- scansione barcode/EAN;
- card mobile;
- quantità;
- prezzo Netto/Ivato;
- IVA;
- sconti;
- totali;
- numerazione;
- salvataggio e blocco;
- gestione modifiche non salvate;
- eliminazione documenti;
- eliminazione righe;
- Pagamenti/Tesoreria;
- collegamenti documentali Includi/Genera.

La regola è:

> **si usa il contratto comune dei documenti e si configurano soltanto le differenze reali del Banco.**

Una differenza visiva o funzionale non autorizza a copiare un componente già comune.

---

# 1. Identità del modulo

## 1.1 Vendita al banco

La Vendita al banco rappresenta la **singola vendita fisica conosciuta da VestiFlow**.

È un documento gestionale:

- non è un carrello;
- non è una mini-cassa;
- non è un registratore telematico;
- non certifica da sola l'emissione del documento commerciale;
- deve funzionare anche con cassa/RT esterni e non collegati.

L'eventuale futura integrazione con una cassa o un RT deve agganciarsi alla Vendita al banco esistente, senza sostituirla con un secondo tipo di documento.

## 1.2 Reso al banco

Il Reso al banco usa **la stessa struttura documentale della Vendita al banco**.

È autonomo e non presuppone una vendita precedente in VestiFlow.

Differisce dalla Vendita al banco essenzialmente per:

- verso economico: rettifica negativa;
- effetto fisico: eventuale **Carica giacenze** invece di Scarica giacenze;
- nessun collegamento a una Vendita al banco originaria.

---

# 2. Terminologia e navigazione

Terminologia funzionale corrente:

- **Vendite al banco** = modulo / riepilogo;
- **Vendita al banco** = documento di vendita;
- **Reso al banco** = documento di reso;
- **Nuova vendita al banco** = creazione vendita;
- **Nuovo reso al banco** = creazione reso.

Sono legacy, quando riferiti al documento VestiFlow:

- Vendita negozio;
- Vendita in negozio;
- Cassa;
- Carrello.

## 2.1 Riepilogo

Nel riepilogo **Vendite al banco** devono essere disponibili due azioni di creazione distinte:

- **Nuova vendita al banco**
- **Nuovo reso al banco**

Non esiste un interruttore dentro il documento che trasformi Vendita ↔ Reso.

Il click su un documento già salvato apre la normale maschera documentale secondo il comportamento comune VestiFlow. L'eventuale Dettaglio/anteprima è un'azione separata.

Eventuali scorciatoie già previste dalla navigazione generale non devono introdurre una seconda maschera o un secondo flusso di creazione.

---

# 3. Struttura comune del documento

Vendita e Reso al banco usano la stessa struttura dei documenti VestiFlow:

1. testata;
2. area comune di ricerca/scansione;
3. righe documento condivise;
4. piede con sconti e totali;
5. azioni **Salva** e **Annulla**;
6. comportamento comune di blocco dopo il salvataggio.

Non esiste una struttura `CartLine[]` o equivalente come seconda fonte di verità.

La riga del Banco è la **stessa riga documento condivisa** degli altri documenti, configurata con meno colonne.

---

# 4. Testata

Vendita al banco e Reso al banco hanno la stessa testata.

Campi pertinenti:

- **Location**
- **Cliente** facoltativo
- **Data documento**
- **Serie**
- **Numero**

## 4.1 Location

La Location determina il magazzino interessato dagli effetti fisici.

Regole:

- se esiste un default valido, viene precompilato;
- il default non rende il campo non modificabile;
- l'operatore può scegliere una Location consentita diversa;
- non devono essere registrati effetti fisici senza una Location valida.

Tenant e Location devono essere verificati anche lato backend: non basta il filtro UI.

## 4.2 Cliente

Il Cliente è facoltativo sia sulla Vendita sia sul Reso.

Usa il selettore/anagrafica comune dei documenti.

## 4.3 Data documento e data tecnica di creazione

`documentDate` e `createdAt` sono due concetti diversi.

### Data documento

- proposta con la data corrente su un documento nuovo;
- visibile all'operatore;
- modificabile;
- persistita;
- caricata dal documento quando viene riaperto;
- modificabile anche in una successiva modifica secondo il normale contratto documentale.

### `createdAt`

- timestamp tecnico generato da VestiFlow;
- non è scelto dall'operatore;
- non deve essere mostrato come Data documento;
- non deve essere riscritto per farlo coincidere con `documentDate`.

La modifica della Data documento non deve rinumerare automaticamente un documento già numerato.

### Verifica obbligatoria

Prima di modificare la gestione delle date va verificato come il codice corrente usa:

- Data documento;
- `createdAt`;
- data dei movimenti;
- Registro Corrispettivi;
- report e filtri temporali.

Non riallineare campi tecnici e funzionali per supposizione.

## 4.4 Serie e numero

Vendita e Reso usano il **sistema di numerazione comune**:

- stessa gestione Serie;
- stesso numeratore;
- proposta automatica del numero da parte di VestiFlow;
- stessa gestione di unicità e concorrenza;
- nessun contatore parallelo specifico del Banco.

---

# 5. Riga documento condivisa

## 5.1 Principio

Vendita e Reso al banco usano **la stessa componente di riga degli altri documenti**, desktop e mobile.

Dove un campo è comune devono essere comuni anche:

- controllo;
- focus;
- tastiera;
- validazione UI;
- stile;
- stato disabled/read-only;
- comportamento di modifica.

La semplificazione del Banco consiste nel **mostrare meno colonne**, non nel creare una riga diversa.

## 5.2 Colonne principali

Preset operativo di riferimento:

- Nome prodotto / articolo
- SKU
- Q.tà
- U.M.
- Prezzo netto oppure Prezzo ivato
- Sconto
- IVA
- Scarica giacenze / Carica giacenze
- Totale

Il preset può essere affinato tramite il sistema comune delle colonne senza creare configurazioni locali incompatibili.

## 5.3 Colonne informative opzionali

Devono poter essere rese disponibili tramite il selettore comune **Colonne**, quando pertinenti:

- Cod. articolo
- Cod. fornitore
- EAN
- Giacenza
- Disponibile
- Prezzo barrato
- Prezzo Shopify, solo quando Shopify è disponibile per il tenant

### EAN

EAN deve essere disponibile anche in Vendita e Reso al banco.

La possibilità di nasconderlo non significa che la scansione smetta di funzionare: visualizzazione e motore scanner sono concetti distinti.

## 5.4 Costo articolo: esclusione esplicita

> **Costo articolo NON deve essere disponibile nella Vendita al banco né nel Reso al banco.**

Non deve comparire:

- nel preset;
- fra le colonne nascoste;
- nel selettore Colonne.

Questa è un'eccezione esplicita alla disponibilità generale delle colonne informative.

## 5.5 Una sola colonna Prezzo

Non devono esistere due colonne parallele "Prezzo vendita" e "Prezzo articolo".

Esiste una sola colonna:

- **Prezzo netto**, oppure
- **Prezzo ivato**

in base alla modalità corrente.

Il valore iniziale viene dal prezzo dell'anagrafica dell'articolo/variante selezionata.

Una volta portato nella riga:

- è modificabile per quella vendita/reso;
- viene salvato nello snapshot del documento;
- la modifica non aggiorna il prezzo dell'anagrafica;
- una modifica successiva dell'anagrafica non riscrive automaticamente il documento già salvato.

---

# 6. Ricerca, aggiunta e scansione

## 6.1 Un solo sistema comune

Vendita e Reso al banco devono usare la **stessa infrastruttura di ricerca e scansione degli altri documenti**, con particolare riferimento al sistema già usato dall'Ordine cliente.

Non devono esistere:

- ricerca locale del Banco;
- scanner locale del Banco;
- overlay fotocamera duplicato;
- gestione focus ricostruita solo per questo modulo.

Il componente comune riconosce/cerca l'articolo. Il documento applica la propria policy di aggiunta.

## 6.2 Query di ricerca

Il testo digitato nel campo di ricerca è **una query**, non una riga documento.

Non deve essere persistito come riga solo perché esiste testo nell'input.

La riga documento segue il normale contratto comune di selezione/compilazione.

## 6.3 Distinzione fondamentale: aggiunta rapida vs nuova riga esplicita

Questa distinzione è obbligatoria.

### Scanner o aggiunta rapida tramite ricerca

Se la stessa variante è già presente nel documento:

> **incrementa la quantità della riga esistente.**

Esempio:

```text
scanner variante A
scanner variante A
→ una riga A con Q.tà 2
```

Lo stesso principio vale quando l'operatore usa l'area comune di ricerca/inserimento rapido.

### Nuova riga esplicita

Se l'operatore crea volontariamente una **nuova riga** e in quella riga seleziona la stessa variante già presente:

> **la nuova riga resta distinta e NON viene accorpata.**

Esempio:

```text
riga 1: variante A · Q.tà 2
nuova riga esplicita
riga 2: variante A · Q.tà 1
→ restano due righe autonome
```

Quindi la regola NON è:

> stesso articolo = sempre accorpa.

La regola è:

> **scanner/aggiunta rapida incrementano; nuova riga esplicita preserva una riga distinta.**

Le righe distinte mantengono identità propria e non devono essere fuse automaticamente nei salvataggi successivi.

## 6.4 Codice non trovato

Un codice non risolto:

- non deve creare automaticamente una riga valida;
- non deve creare automaticamente un prodotto;
- deve seguire il comportamento del componente comune di ricerca/scansione.

Eventuali azioni di ricerca alternativa o creazione articolo devono appartenere all'infrastruttura comune, non al Banco.

## 6.5 Scanner HID e fotocamera

## ⭐ La fotocamera è una capability MOBILE — deciso il 24/08/2026

⛔ **Questa decisione è più recente** delle righe qui sotto, che dicevano «HID +
fotocamera» senza distinguere dove il comando si offre.

|             | Comando fotocamera | Lettore HID / keyboard wedge | Ricerca manuale, EAN, SKU, Cod. articolo |
| ----------- | ------------------ | ---------------------------- | ---------------------------------------- |
| **Desktop** | **no**             | sì, pieno supporto           | sì                                       |
| **Mobile**  | sì, overlay comune | sì                           | sì                                       |

⭐ **Il criterio è a chi serve.** Davanti a un monitor la fotocamera del
portatile inquadra l'operatore, non il capo: un pulsante che apre una finestra
inutilizzabile è un comando che non comanda.

⛔ **L'overlay comune NON si rimuove**, e il motore di scansione nemmeno: cambia
soltanto **dove viene esposto**. Su scrivania si legge col lettore HID, che
scrive nel campo di ricerca come una tastiera e non passa dal comando
fotocamera.

⚠️ **La distinzione NON si scrive nei documenti.** Vive nell'infrastruttura
comune — `BarcodeDetectionService.cameraScanOffered`, che mette insieme le tre
condizioni (bandiera d'ambiente, fotocamera presente, schermo compatto) — e la
chiedono **dodici** consumer: sette maschere documento più cinque schermate di
magazzino e catalogo. Dodici `@if` da tenere allineati sono dodici occasioni di
dimenticarne uno.

⚠️ E dove non si offre, il comando **non c'è**: non è disabilitato. Un pulsante
grigio dichiara una funzione e non la dà.

Devono essere riusati i sistemi comuni già presenti/previsti:

- lettore HID / keyboard wedge;
- scansione tramite fotocamera;
- gestione focus;
- continuità delle scansioni;
- prevenzione della scrittura accidentale del barcode dentro Prezzo, Quantità, Sconto o altri input.

Il Banco definisce solo l'effetto dell'articolo riconosciuto, non il motore di riconoscimento.

---

# 7. Desktop e mobile

## 7.1 Desktop

La riga desktop usa la componente condivisa e le sole colonne previste dal profilo Banco.

Non deve esistere una `<table>` autonoma della Vendita/Reso al banco che imiti le altre maschere.

## 7.2 Mobile

> **La card mobile deve essere la stessa base condivisa già definita per l'Ordine cliente.**

La Vendita/Reso al banco non deve avere una card locale.

La card deve riusare il comportamento comune per:

- nome prodotto;
- espansione/riduzione;
- eliminazione riga;
- quantità con `− / valore / +`;
- Prezzo netto/ivato;
- Sconto;
- IVA;
- Totale;
- Scarica/Carica giacenze;
- focus e tastiera;
- informazioni opzionali abilitate dal profilo colonne.

### Stato attuale da non confondere con il requisito

Il fatto che una versione precedente della documentazione dichiarasse la card "completata" non è prova sufficiente.

**Comportamento osservato dall'owner al 23/08/2026:** la card della Vendita al banco non appare ancora come quella attesa dell'Ordine cliente.

Va quindi verificato nel codice:

1. quale componente viene realmente renderizzato;
2. quale breakpoint attiva la card;
3. se esistono template/CSS locali residui;
4. se la card è realmente condivisa o solo simile.

---

# 8. Netto/Ivato, IVA, sconti e totali

## 8.1 Netto / Ivato

Vendita e Reso al banco seguono esattamente il **contratto comune Netto/Ivato**.

Il selettore desktop vive nella **testata della colonna Prezzo**, come negli altri documenti.

Non introdurre un selettore Netto/Ivato nella testata generale del documento.

La modalità iniziale usa il comportamento comune già definito per:

- default aziendale;
- memoria operatore/tipo documento, dove prevista;
- persistenza della modalità sul documento.

Nessun default specifico "sempre ivato" per il Banco.

## 8.2 IVA

IVA usa il **componente comune già esistente**.

Non creare un controllo IVA specifico per Vendita/Reso al banco.

Il valore portato nella riga segue il normale principio di snapshot del documento.

## 8.3 Sconto riga

Usa lo stesso componente e lo stesso motore sconti degli altri documenti.

## 8.4 Sconto extra documento

Vendita e Reso al banco prevedono **lo sconto extra a livello documento**.

Deve essere realizzato tramite il contratto comune degli sconti documento.

Se il contratto comune deve supportare percentuale e importo o va completato, l'estensione deve essere fatta **nel componente/motore comune**, non dentro la Vendita al banco.

## 8.5 Totali e arrotondamenti

I valori monetari definitivi sono espressi in euro a **due decimali**.

Esempio:

```text
12,345678 € → 12,35 €
```

Regola economica comune:

1. mantenere la precisione necessaria nei valori unitari/intermedi;
2. calcolare la riga;
3. determinare i valori definitivi della riga a due decimali;
4. calcolare i totali documento come **somma dei valori definitivi delle righe**.

Non introdurre un ricalcolo globale del Banco diverso dagli altri documenti.

---

# 9. Effetti di magazzino

## 9.1 Nessun movimento durante la compilazione

Non producono movimenti fisici:

- scansione;
- ricerca;
- aggiunta riga;
- modifica quantità;
- modifica prezzo;
- modifica sconto;
- autosuggest;
- cambio focus.

L'effetto nasce solo con il **salvataggio valido del documento** secondo il contratto comune.

## 9.2 Vendita al banco — Scarica giacenze

Ogni riga movimentabile usa:

> **Scarica giacenze**

Default:

- articolo che gestisce magazzino → **ON**
- servizio/articolo non movimentabile → **OFF**

Il default resta modificabile per riga.

Con quantità `Q`:

```text
Scarica giacenze ON  → effetto fisico −Q
Scarica giacenze OFF → nessun effetto fisico della riga
```

La riga resta comunque nel documento e nei valori economici.

## 9.3 Reso al banco — Carica giacenze

Ogni riga movimentabile usa:

> **Carica giacenze**

Default:

- articolo che gestisce magazzino → **ON**
- servizio/articolo non movimentabile → **OFF**

Con quantità `Q`:

```text
Carica giacenze ON  → effetto fisico +Q
Carica giacenze OFF → nessun effetto fisico della riga
```

L'effetto economico negativo del Reso non dipende dalla spunta di magazzino.

## 9.4 Nessuna distinzione vendibile / non vendibile nel Reso

Nel Reso al banco non si introduce:

- merce vendibile;
- merce non vendibile;
- danneggiato;
- scarto;
- stato inventariale speciale.

Il Reso registra il fatto gestionale del rientro/rettifica.

L'eventuale trattamento successivo di merce da scartare, isolare o rendere indisponibile appartiene ad altro documento/processo.

## 9.5 Giacenza e Disponibile

Restano valide le regole comuni:

```text
Giacenza     = quantità fisica risultante dagli effetti di magazzino
Impegnata    = quantità assegnata a ordini attivi
Disponibile  = Giacenza - Impegnata
```

Giacenza e Disponibile possono diventare negative.

Stock insufficiente:

- warning visibile;
- **non bloccante**.

## 9.6 Identità, delta e idempotenza

Ogni effetto fisico deve essere riconducibile a:

- tenant;
- Location;
- documento;
- riga documento.

Una modifica di un documento già salvato deve portare l'effetto allo **stato finale corretto**, non sommare nuovamente l'intero documento.

Esempio:

```text
Vendita salvata Q.tà 3 → effetto complessivo −3
modifico a Q.tà 5      → effetto complessivo finale −5
NON −3 + −5 = −8
```

Lo stesso vale per:

- quantità;
- articolo/variante;
- Location;
- spunta Scarica/Carica;
- eliminazione riga.

Doppio click, retry o risposta HTTP persa non devono duplicare documento o movimenti.

---

# 10. Differenze Vendita / Reso

| Aspetto                         | Vendita al banco                   | Reso al banco                                            |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| struttura                       | comune                             | comune                                                   |
| riga                            | comune                             | comune                                                   |
| mobile                          | comune                             | comune                                                   |
| ricerca/scansione               | comune                             | comune                                                   |
| prezzo/IVA/sconti               | comune                             | comune                                                   |
| effetto economico               | positivo                           | negativo                                                 |
| quantità/prezzi inseriti        | positivi                           | positivi; il tipo documento determina il segno economico |
| magazzino                       | Scarica giacenze                   | Carica giacenze                                          |
| documento origine               | secondo sistema documentale comune | **nessuno**                                              |
| collegamento a Vendita al banco | n/a                                | **nessuno**                                              |

---

# 11. Reso al banco: autonomia definitiva

> **Il Reso al banco NON nasce da una Vendita al banco e NON include una Vendita al banco.**

Non esistono quindi nel contratto del Reso:

- vendita originaria obbligatoria;
- vendita originaria facoltativa;
- "Genera Reso" dalla Vendita;
- "Includi Vendita" nel Reso;
- quantità massima rendibile derivata da una vendita;
- quantità già resa su quella vendita;
- recupero automatico del prezzo storico da una vendita;
- confronto venduto/reso.

Il Reso usa il prezzo corrente dell'anagrafica come precompilazione della nuova riga e poi salva il proprio snapshot, esattamente come il normale contratto prezzi del documento.

---

# 12. Salvataggio, Annulla, blocco e modifica

## 12.1 Azioni interne

All'interno di Vendita e Reso al banco valgono le azioni classiche comuni:

- **Salva**
- **Annulla**

Non introdurre un'azione finale diversa come motore autonomo del Banco.

`Annulla` significa annullare/scartare le modifiche correnti secondo il comportamento comune; non significa eliminare il documento dal database.

## 12.2 Dopo il salvataggio

> **A salvataggio riuscito si resta sullo stesso documento e il documento si blocca.**

Si usa **esattamente il meccanismo comune già esistente negli altri documenti**.

Non introdurre:

- auto-apertura del cliente/documento successivo;
- nuova Vendita vuota automatica;
- stato DB inventato solo per rappresentare il lock UI.

Per modificare un documento già salvato si usa il normale comportamento comune di sblocco/modifica.

Dopo il nuovo salvataggio riuscito il documento torna bloccato.

## 12.3 Nessun autosalvataggio

Il salvataggio è un'azione esplicita dell'operatore.

Navigazione o operazioni di riga non devono salvare silenziosamente il documento.

## 12.4 Modifiche non salvate

Il normale sistema comune di protezione dalle modifiche non salvate deve funzionare anche su Vendita/Reso al banco.

Dopo un salvataggio riuscito il form deve risultare pulito e non generare falsi avvisi.

## 12.5 Idempotenza della prima creazione

La prima creazione deve essere idempotente.

Stesso intento ripetuto per:

- doppio click;
- timeout;
- retry;
- risposta persa;

non deve produrre:

- un secondo documento;
- un secondo effetto fisico;
- una seconda presenza economica.

La forma tecnica va verificata nel codice prima di implementare.

---

# 13. Eliminazione documenti e righe

## 13.1 Eliminazione del documento

Regola trasversale VestiFlow:

> **un documento/registrazione già salvato, quando eliminabile, si elimina dal relativo riepilogo/elenco, non dall'interno della maschera documento.**

Vale anche per:

- Vendita al banco;
- Reso al banco;
- Corrispettivi manuali;
- altri documenti/registrazioni per i quali la cancellazione è prevista.

Dentro Vendita/Reso al banco **non deve esserci il pulsante Elimina documento**.

L'eliminazione deve riallineare correttamente gli effetti propri del documento secondo il sistema comune.

La gestione tecnica di eliminazione singola/multipla non va implementata localmente nel Banco.

## 13.2 Eliminazione delle righe

Dentro il documento deve essere possibile eliminare **una o più righe** secondo il sistema comune che verrà consolidato per tutti i documenti.

Non progettare una gestione selezione/eliminazione righe specifica per il Banco.

---

# 14. Collegamenti documentali: Includi / Genera

Vendita al banco aderisce al sistema documentale comune **Includi / Genera**.

La matrice delle coppie origine → destinazione, il consumo documentale, l'eventuale consumo dell'Impegnata e le regole anti-duplicazione fisica vivono esclusivamente in:

> `12-specifica-collegamenti-documentali.md`

Questa specifica **non ne mantiene una copia**.

Motivo:

> una matrice duplicata dentro il Banco diventerebbe inevitabilmente una seconda fonte di verità.

Regola locale:

- nessun motore Includi/Genera specifico del Banco;
- nessun collegamento Vendita al banco → Reso al banco;
- nessun collegamento Reso al banco → Vendita al banco.

---

# 15. Pagamenti e Tesoreria

Vendita e Reso al banco **non definiscono un proprio dominio Pagamenti**.

Tutto ciò che riguarda:

- Tipo pagamento;
- anagrafica Tipi;
- default;
- scadenze;
- Risorse;
- movimenti finanziari;
- saldi;
- rimborsi;
- allocazioni;
- Tesoreria;

è governato dalla specifica comune **Pagamenti, Scadenzario e Tesoreria operativa**.

Questa specifica non copia quelle regole.

Il Banco deve soltanto montare il perimetro che la specifica Pagamenti assegna a Vendita/Reso al banco, usando la stessa anagrafica condivisa e senza creare lookup o tabelle locali.

---

# 16. Registro Corrispettivi e report

## 16.1 Vendita al banco

Una Vendita al banco salvata rappresenta una vendita economica conosciuta da VestiFlow.

Deve comparire **una sola volta** nel Registro Corrispettivi derivato.

Classificazione funzionale:

```text
Tipo:    Vendita
Origine: Vendita al banco
```

## 16.2 Reso al banco

Un Reso al banco salvato rappresenta una rettifica economica negativa.

Deve comparire **una sola volta** nel Registro Corrispettivi.

Classificazione funzionale:

```text
Tipo:    Reso
Origine: Vendita al banco
```

`Tipo` dice **cosa è successo**.

`Origine` dice **da quale flusso nasce**.

Per questo il Reso non richiede una seconda origine "Reso al banco": resta un evento del flusso Banco, distinto dal Tipo = Reso.

## 16.3 Nessun effetto parallelo

Registro Corrispettivi, riepiloghi e report:

- leggono il fatto economico;
- non creano movimenti di magazzino;
- non duplicano il documento;
- devono riflettere lo stato corrente del documento dopo una modifica valida.

Se un documento viene eliminato dal riepilogo, i lettori derivati devono smettere di conteggiarlo secondo il sistema comune.

---

# 17. Shopify nella Vendita/Reso al banco

Shopify ha **un solo uso specifico** dentro la riga del Banco:

> **consultazione del Prezzo Shopify dell'articolo/variante selezionata.**

Regole:

- colonna informativa;
- sola lettura;
- attivabile/disattivabile dal selettore Colonne;
- nessuna modifica del prezzo Shopify dal Banco;
- nessun push;
- nessun sincronismo avviato dalla modifica della riga;
- nessun effetto inventariale Shopify specifico del Banco.

Il valore mostrato è quello associato all'articolo/variante effettivamente selezionata secondo l'anagrafica canonica.

## 17.1 Feature gating

Se il tenant non ha il modulo Shopify:

- la colonna Prezzo Shopify non compare nella riga;
- non compare nemmeno nel selettore Colonne;
- nessun banner;
- nessun warning;
- nessun errore;
- nessun indicatore Shopify.

Questa regola non autorizza a cancellare eventuali dati Shopify presenti nel database: riguarda la loro esposizione nel Banco.

---

# 18. Registratore telematico / cassa esterna

Vendita al banco VestiFlow e registratore telematico sono concetti distinti.

Registrare una Vendita al banco:

- significa registrare il fatto gestionale conosciuto da VestiFlow;
- non significa dichiarare che il documento commerciale sia stato emesso;
- non richiede che VestiFlow controlli un RT.

Non introdurre nel Banco, senza una futura specifica dedicata:

- stato scontrinato/non scontrinato;
- workflow fiscale RT;
- chiusura fiscale;
- riconciliazione automatica col registratore;
- vecchi stati "commercialista".

---

# 19. Snapshot documentale

Vendita e Reso al banco seguono la regola comune:

> **un documento salvato è uno snapshot completo dei dati effettivamente usati.**

Alla riapertura non devono essere ricalcolati automaticamente dall'anagrafica corrente:

- prezzo;
- IVA;
- nome/testo della riga;
- altri dati snapshot.

Una modifica dell'anagrafica successiva non riscrive il documento storico.

Solo un'azione esplicita dell'operatore può cambiare i dati del documento, secondo il normale contratto di modifica.

---

# 20. Verifiche tecniche obbligatorie prima delle modifiche

Questa sezione descrive **cose da verificare nel codice**, non nuove regole funzionali.

## 20.1 Riga desktop e card mobile

Verificare:

- se Vendita/Reso usa realmente la riga condivisa;
- se la card mobile è realmente quella comune prevista;
- se restano componenti/template/CSS locali;
- se i breakpoint mobile sono corretti.

## 20.2 Ricerca e scanner

Verificare:

- componente realmente usato da Ordine cliente;
- scanner HID;
- fotocamera;
- focus;
- comportamento codice non trovato;
- comportamento dopo selezione;
- assenza di implementazioni duplicate nel Banco.

## 20.3 Prezzi

Verificare:

- sorgente del prezzo anagrafico;
- snapshot nella riga;
- Netto/Ivato;
- memoria/default;
- assenza di un secondo "Prezzo articolo";
- esclusione completa del Costo articolo;
- Prezzo Shopify read-only e correttamente gated.

## 20.4 Date

Verificare separatamente:

- `documentDate`;
- `createdAt`;
- timestamp/data dei movimenti;
- filtri Registro Corrispettivi;
- report.

Non assumere che debbano usare tutti lo stesso campo.

## 20.5 Stock

Verificare:

- un effetto fisico per riga;
- update per differenza;
- cambio Location;
- cambio variante;
- cambio spunta;
- eliminazione riga;
- retry;
- tenant;
- Location;
- giacenze negative;
- warning non bloccante.

## 20.6 Prima creazione

Verificare la reale protezione idempotente della prima creazione.

Il fatto che il risalvataggio sia idempotente non dimostra che lo sia anche il primo POST dopo timeout.

## 20.7 Salvataggio e blocco

Verificare che Vendita/Reso riusi **lo stesso meccanismo già esistente negli altri documenti**:

```text
Salva riuscito
→ resto sul documento
→ documento bloccato
→ form clean
```

## 20.8 Eliminazione

Verificare il sistema comune di eliminazione dai riepiloghi prima di introdurre qualsiasi percorso locale.

---

# 21. Criteri di accettazione

## BANK-001 — riga condivisa desktop

Aprire Vendita al banco e un altro documento che usa la riga comune.

Atteso:

- stessa cella Quantità;
- stesso Prezzo;
- stesso Sconto;
- stessa IVA;
- stessi comportamenti di focus e tastiera;
- nessuna seconda tabella locale del Banco.

## BANK-002 — card mobile

Aprire Vendita al banco su breakpoint mobile.

Atteso:

- card sulla stessa base dell'Ordine cliente;
- quantità `− / valore / +`;
- prezzo/sconto/IVA coerenti;
- espansione e azioni coerenti;
- nessuna card locale alternativa.

## BANK-003 — scanner ripetuto

```text
scanner variante A
scanner variante A
```

Atteso:

```text
una riga A
Q.tà = 2
```

Nessun movimento prima del salvataggio.

## BANK-004 — aggiunta rapida ripetuta

Aggiungere due volte la stessa variante tramite la ricerca rapida comune.

Atteso:

- incremento della riga esistente;
- nessuna seconda riga automatica.

## BANK-005 — nuova riga esplicita con stessa variante

```text
riga A già presente
→ Nuova riga
→ seleziono di nuovo variante A
```

Atteso:

- due righe distinte;
- nessun accorpamento automatico;
- identità righe separate.

## BANK-006 — Costo articolo

Aprire selettore Colonne.

Atteso:

- **Costo articolo assente**.

## BANK-007 — EAN

Aprire selettore Colonne.

Atteso:

- EAN disponibile.

## BANK-008 — Prezzo

Inserire articolo con prezzo anagrafico 25,00 €.

Atteso:

- riga precompilata 25,00 €;
- modifico la riga a 22,00 €;
- documento salva 22,00 €;
- anagrafica resta 25,00 €;
- riapertura documento mostra 22,00 €.

## BANK-009 — Netto/Ivato

Cambiare modalità dalla testata della colonna Prezzo.

Atteso:

- stesso comportamento degli altri documenti;
- modalità persistita;
- nessun selettore parallelo nella testata generale.

## BANK-010 — IVA

Atteso:

- componente IVA comune;
- nessun controllo specifico del Banco.

## BANK-011 — sconto extra

Atteso:

- usa il contratto comune dello sconto documento;
- nessun calcolo locale Banco.

## BANK-012 — vendita e stock

Articolo movimentabile, Q.tà 2, Scarica giacenze ON.

Atteso dopo Salva valido:

- effetto fisico complessivo −2;
- un solo effetto per riga;
- documento salvato una volta.

## BANK-013 — vendita senza scarico

Stessa riga con Scarica giacenze OFF.

Atteso:

- riga economica presente;
- nessun effetto fisico.

## BANK-014 — reso e stock

Articolo movimentabile, Q.tà 2, Carica giacenze ON.

Atteso:

- effetto fisico complessivo +2;
- rettifica economica negativa.

## BANK-015 — reso senza carico

Carica giacenze OFF.

Atteso:

- nessun effetto fisico;
- Reso resta economicamente presente come rettifica.

## BANK-016 — stock insufficiente

Vendere oltre la Disponibile.

Atteso:

- warning non bloccante;
- salvataggio consentito;
- Giacenza/Disponibile possono diventare negative.

## BANK-017 — modifica per differenza

Vendita salvata Q.tà 3, poi modificata a 5.

Atteso:

- effetto finale −5;
- non −8;
- nessuna duplicazione economica.

## BANK-018 — retry prima creazione

Simulare doppio click/timeout/retry sul primo salvataggio.

Atteso:

- un solo documento;
- un solo effetto fisico per riga;
- una sola presenza nel Registro.

## BANK-019 — salvataggio e blocco

Dopo Salva riuscito:

- si resta sul documento;
- il documento si blocca con il meccanismo comune;
- nessuna nuova Vendita/Reso si apre automaticamente;
- nessun falso warning modifiche non salvate.

## BANK-020 — eliminazione documento

Aprire un documento salvato.

Atteso:

- nessun pulsante Elimina documento nella maschera;
- eliminazione disponibile dal relativo riepilogo secondo il sistema comune.

## BANK-021 — Reso autonomo

Aprire Nuovo reso al banco.

Atteso:

- nessuna vendita originaria richiesta;
- nessun "Genera da Vendita";
- nessun "Includi Vendita";
- nessun tetto quantità derivato da una vendita precedente.

## BANK-022 — Corrispettivi

Vendita al banco:

```text
Tipo = Vendita
Origine = Vendita al banco
```

Reso al banco:

```text
Tipo = Reso
Origine = Vendita al banco
```

Entrambi compaiono una sola volta.

## BANK-023 — Shopify attivo

Tenant con Shopify e prezzo online valorizzato.

Atteso:

- Prezzo Shopify disponibile nel selettore Colonne;
- valore read-only dell'articolo/variante;
- nascondibile;
- nessun push o modifica Shopify.

## BANK-024 — Shopify assente

Tenant senza modulo Shopify.

Atteso:

- Prezzo Shopify assente anche dal selettore Colonne;
- nessun banner/warning/errore/indicatore Shopify.

## BANK-025 — Data documento

Creare documento oggi con `documentDate` diversa da oggi.

Atteso:

- Data documento salvata come scelta;
- `createdAt` resta tecnico;
- nessun riallineamento automatico;
- nessuna rinumerazione automatica per il solo cambio data.

---

# 22. Regole esplicitamente superate / da non reintrodurre

Non reintrodurre nella nuova Vendita/Reso al banco:

- `CartLine[]` come modello funzionale;
- carrello;
- mini-cassa;
- riga specifica del Banco;
- card mobile specifica del Banco;
- scanner/ricerca specifici del Banco;
- una "riga manuale speciale" diversa dalla riga documento comune;
- Costo articolo;
- doppia colonna Prezzo vendita / Prezzo articolo;
- forcing sempre Ivato;
- selettore Netto/Ivato nella testata generale;
- auto-apertura di una nuova vendita dopo il salvataggio;
- eliminazione documento dentro la maschera;
- motore locale di eliminazione righe;
- motore locale Pagamenti;
- motore locale Includi/Genera;
- Vendita al banco → Genera → Reso al banco;
- Reso al banco → Includi/deriva da Vendita al banco;
- vendibile/non vendibile nel Reso;
- stati fiscali RT inventati;
- vecchio workflow commercialista;
- operazioni Shopify diverse dalla consultazione del prezzo online nel Banco.

---

# 23. Fonti trasversali da richiamare, non duplicare

Questa specifica governa Vendita/Reso al banco, ma non deve diventare una copia dei contratti comuni.

Per le materie trasversali usare le rispettive fonti correnti del progetto, in particolare:

- `VestiFlow_Contesto_Master_Progetto.docx`
- specifica/contratto comune dei documenti e delle righe
- `04-specifica-numerazione-documenti.md`
- `12-specifica-collegamenti-documentali.md`
- specifica Registro Corrispettivi
- `VestiFlow_Specifica_Pagamenti_Tesoreria_v1_1_21-08-2026.docx`

Se una regola trasversale cambia, si aggiorna nella sua fonte comune e Vendita/Reso al banco la ereditano, salvo eccezioni esplicitamente dichiarate in questo documento.

---

# 24. Mandato tecnico prima di intervenire sul codice

Prima di preparare modifiche:

1. ispezionare il codice corrente;
2. individuare la causa radice di ogni divergenza;
3. distinguere requisito, comportamento osservato e ipotesi tecnica;
4. censire componenti comuni già esistenti;
5. evitare qualsiasi seconda implementazione locale;
6. verificare UI, API, database, quantità, movimenti, idempotenza, tenant e Location;
7. verificare gli effetti di modifica/eliminazione per differenza;
8. dichiarare i rischi di regressione;
9. aggiungere test concreti BANK-*;
10. non eseguire push, merge, deploy o pubblicazioni senza richiesta esplicita dell'owner.

**Il codice corrente è una fotografia dell'esistente, non la fonte del requisito.**
