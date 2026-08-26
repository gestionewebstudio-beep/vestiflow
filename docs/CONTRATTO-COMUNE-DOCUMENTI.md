# VestiFlow — Blocco 0 canonico

## Contratto comune dei documenti a righe

**Stato:** specifica normativa consolidata  
**Data:** 22/08/2026  
**Owner:** Luigi  
**Scopo:** fissare le regole comuni che devono governare i documenti VestiFlow prima della revisione documento-per-documento.

> Questo documento contiene **regole comuni vigenti**, eccezioni esplicite, gap tecnici già individuati e decisioni ancora aperte.  
> Non sostituisce le specifiche funzionali dei singoli documenti: ne costituisce il contratto comune.
>
> **Regola di lettura:** comportamento osservato nel codice ≠ requisito. Se il codice diverge, si censisce la causa radice e si allinea il codice alla specifica corrente.

---

# 1. Perimetro e principio di condivisione

VestiFlow deve avere un **contratto comune per tutti i documenti con vere righe articolo/prodotto**.

Rientrano nel contratto comune:

- Ordine cliente
- Preventivo
- DDT vendita
- Vendita al banco
- Reso al banco
- Ordine fornitore
- Arrivo merce
- Trasferimento
- Proforma
- Fattura
- Fattura accompagnatoria
- Nota di credito
- Rettifica / Inventario, quando verranno affrontati nel loro blocco dedicato

Non rientrano nella normale griglia articolo:

- **Registrazione fattura fornitore**: ha righe economico-contabili; può includere uno o più Arrivi merce e da essi genera righe a valore/totali, non normali righe prodotto.
- **Corrispettivo manuale**: registrazione economica senza righe articolo.

## Principio

Si condividono:

- componenti;
- grammatica visuale;
- navigazione;
- comportamento delle celle;
- header;
- quick-row;
- card mobile;
- meccanismi tecnici realmente comuni.

Non si fondono regole di dominio diverse.

**Stessa cella grafica non significa stesso dato.**  
Le differenze di dominio vengono passate alla componente come dati/policy; non devono nascere `if (documentType...)` sparsi dentro le celle condivise.

---

# 2. Anatomia comune del documento

Ogni documento usa la stessa grammatica strutturale, adattata ai campi che realmente gli appartengono.

## 2.1 Testata

Può contenere, secondo il documento:

- tipo;
- Data;
- Serie;
- Numero;
- controparte;
- location/sedi;
- riferimenti;
- condizioni;
- campi specifici.

I valori predefiniti **precompilano**, ma non rendono il campo non modificabile salvo reale vincolo funzionale.

## 2.2 Comandi sopra le righe

I comandi possono differire per documento.

Esempi:

- scanner;
- ricerca;
- nuovo prodotto;
- Includi;
- Genera;
- azioni specifiche.

Non si forza lo stesso set di comandi su tutti i documenti; si mantiene la stessa grammatica UI.

## 2.3 Area righe

La struttura comune comprende:

- header colonne;
- eventuale quick-row / riga di inserimento;
- righe documento;
- celle prese dal catalogo canonico;
- card mobile, quando prevista.

**Una query di ricerca o una riga di inserimento vuota non è una riga documento.**

## 2.4 Riepilogo economico

La struttura visuale è comune, ma formule e voci mostrate dipendono dal dominio del documento.

## 2.5 Salvataggio e uscita

La logica di base è comune:

- il salvataggio avviene **solo al click dell’azione esplicita di salvataggio**;
- Tab, Invio, frecce, scanner, cambio campo/riga e apertura pannelli **non salvano**;
- se l’operatore tenta di uscire con modifiche non salvate → avviso;
- se non ci sono modifiche pendenti → uscita normale;
- a salvataggio riuscito **si resta nello stesso documento**, che passa in modalità bloccata / sola lettura;
- dopo il salvataggio riuscito il form non deve risultare ancora sporco;
- un salvataggio fallito non deve cancellare i valori presenti nel form.

Le conferme specifiche di un documento si aggiungono a questo contratto, non lo sostituiscono.

---

# 3. Catalogo canonico di celle e colonne

Una colonna semanticamente uguale deve avere una sola definizione canonica.

A parità di `columnId` devono essere condivisi, salvo override esplicitamente motivato:

- etichetta;
- larghezza base;
- larghezza minima;
- allineamento;
- componente di cella;
- comportamento tastiera/accessibilità.

Il documento sceglie il **sottoinsieme** delle colonne e il preset di visibilità.

## 3.1 Colonne disponibili trasversalmente

Devono poter essere disponibili nei documenti a righe articolo:

- Cod. articolo
- Cod. fornitore
- SKU
- EAN
- Nome prodotto
- Q.tà
- U.M.
- Giacenza
- Disponibile
- Costo articolo
- Prezzo articolo
- Prezzo barrato
- Prezzo Shopify
- Sconto
- IVA
- Totale riga
- Azioni riga

Inoltre, secondo il dominio, esistono i valori economici propri della riga documento, ad esempio:

- costo unitario documento;
- prezzo unitario documento.

Questi non vanno confusi con **Costo articolo** e **Prezzo articolo** dell’anagrafica.

## 3.2 Regole specifiche già decise

### Cod. fornitore

Disponibile trasversalmente, non limitato ai soli documenti di acquisto.

### EAN

Disponibile ovunque, compresi Vendita e Reso al banco.

### Titolo

Disponibile ovunque. ⭐ **Si chiama Titolo, non «Nome prodotto»** _(23/08/2026)_: è la parola di Shopify (`product.title`), e toglie l'ambiguità con la **descrizione**, che è un'altra cosa — il testo lungo dell'articolo, quello che va su Shopify come `body_html`.

**L'articolo ha UN titolo, uguale in ogni documento.** Sulla riga si può modificare: il valore modificato resta **solo in quel documento** e si stampa così; l'anagrafica non cambia.

### Variante

⭐ **Colonna PROPRIA, mai dentro il titolo** _(deciso 23/08/2026)_.

Contiene i **soli valori** delle opzioni: `M / Rosso`. Non `Taglia: M · Colore: Rosso` — in colonna lo spazio è quello che è, ed è la forma di Shopify (`variant.title`).

Tre ragioni, e la prima è quella che il titolo impastato non può dare:

- **una cella vuota dice «articolo senza varianti»**. Con tutto dentro il titolo, «Maglietta cotone» e «Maglietta cotone — M / Rosso» si distinguono solo se sai già cosa cercare;
- il titolo **resta modificabile a mano** senza che la variante si perda. Impastati, chi riscrive il titolo cancella anche la taglia, e nessuno se ne accorge fino alla consegna;
- su mobile la card ha una **voce separata**, collocabile dove serve.

⛔ **Il valore si MEMORIZZA come testo composto**, non come dati grezzi da ricomporre in lettura. Un documento emesso deve continuare a dire quello che diceva: se un DDT di marzo stampava `M / Rosso`, ristamparlo a settembre non deve produrre un formato diverso. Cambiare il formato è una funzione sola nel codice, e vale per i documenti **nuovi** — il passato non si riscrive.

⚠️ **Nella fattura elettronica la colonna separata NON esiste**: lo standard ha un solo campo descrizione per riga. Lì la variante si accoda o va in `CodiceArticolo` — la funzione di composizione serve comunque.

### Descrizione riga

Solo **Arrivo merce**:

- nascosta di default;
- attivabile dal pulsante **Colonne**.

### Lotto / Scadenza

Previsti in:

- Arrivo merce;
- DDT;
- Famiglia Fattura, dove pertinenti.

### Seriali

**Da ricostruire prima di fissare una regola comune.**

### Ordinato / Ricevuto / Residuo

Non vengono assunti come contratto comune: non sono considerati funzionalità consolidate.

## 3.3 Shopify

`Prezzo Shopify` può esistere come dato sottostante, ma:

> un tenant senza modulo Shopify non deve vedere menu, colonne, campi, banner, avvisi, errori o indicatori Shopify.

---

# 4. Fotografia del documento

## Regola superiore

**Il documento salvato è una fotografia completa.**

Alla riapertura non si ricalcolano né si riallineano automaticamente valori dall’anagrafica corrente.

Restano quelli salvati, salvo azione esplicita dell’operatore:

- prezzo;
- costo;
- IVA;
- U.M.;
- descrizione;
- sconto;
- dati trasportati da documenti origine;
- lotto/scadenza;
- altri valori di riga persistiti.

Se esiste un comando esplicito di ricalcolo/aggiornamento, deve essere una scelta volontaria e può richiedere warning prima di sovrascrivere valori storici.

### ⭐ Il RICHIAMO DELL'ARTICOLO è quel comando esplicito _(deciso 23/08/2026)_

> **Richiamare un articolo su una riga significa che l'articolo è la fonte.** I valori
> precedenti si tolgono e si prendono quelli dell'anagrafica — **anche se è lo stesso
> articolo di prima**.

Vale per **ogni documento**, senza eccezioni: è la ragione per cui la struttura dev'essere
una sola. Non esiste che sull'Ordine fornitore sì e altrove no.

**Due campi restano**, perché non hanno una sorgente in anagrafica:

|              |                                                     |
| ------------ | --------------------------------------------------- |
| **quantità** | è quella che l'operatore ha digitato su quella riga |
| **sconto**   | idem                                                |

⛔ **Da non confondere con ciò che gli somiglia.** Il richiamo è un **gesto dell'operatore**.
Il dato che arriva in ritardo, o l'anagrafica modificata da un'altra scheda mentre il
documento è aperto, **non sono gesti**: lì la riga non si tocca.

⛔ E **riaprire un documento salvato non cambia assolutamente nulla.**

## 4.1 Dati della riga

Sono dati del documento, non dell’anagrafica corrente.

Esempi:

- quantità;
- U.M.;
- descrizione;
- costo/prezzo documento;
- sconto;
- IVA;
- lotto/scadenza;
- spunte di effetto magazzino.

## 4.2 Dati articolo mostrati nella riga

Possono essere letture informative o valori usati per precompilare:

- codici;
- Giacenza;
- Disponibile;
- Costo articolo;
- Prezzo articolo;
- Prezzo barrato;
- Prezzo Shopify.

Precompilare non significa mantenere sincronizzato.

## 4.3 Arrivo merce — costo

Regola consolidata:

- `SupplierVariantLink.lastPurchasePriceMinor` → si aggiorna sempre quando esiste il fornitore;
- `ProductVariant.purchasePriceMinor` → si aggiorna **solo** se è attiva la spunta **“Aggiorna il costo in anagrafica con quello inserito”**, riga per riga;
- `Product.purchasePriceMinor` → **non viene aggiornato dai carichi**: è il seed di nascita delle varianti future;
- articolo creato nuovo direttamente dall’Arrivo merce → nasce con i dati inseriti in quel momento; la spunta non governa la nascita.

---

# 5. Quantità, costi, prezzi, sconti, IVA e precisione

## 5.1 Quantità

La cella è comune; sono policy del documento:

- minimo;
- step;
- validator;
- casi in cui zero è ammesso;
- effetti prodotti dalla quantità.

Nessun `min` tecnico locale deve diventare una regola generale.

## 5.2 Precisione economica

Prezzi e costi unitari devono mantenere precisione **`NUMERIC(16,6)` end-to-end**.

Non devono esistere arrotondamenti prematuri che troncano l’unitario.

## 5.3 Ordine di calcolo e arrotondamento

Regola:

1. si parte dai valori unitari precisi;
2. si applicano sconti/scorpori IVA e le altre operazioni previste;
3. si applica la quantità;
4. si determinano i valori economici definitivi **della singola riga**;
5. imponibile, IVA e totale della riga vengono arrotondati al centesimo nel punto economico finale.

**I totali del documento sono la somma dei valori definitivi delle righe.**

Non si ricalcola il totale documento da zero ripetendo globalmente tutte le operazioni sui valori unitari.

Anche i riepiloghi IVA devono quadrarsi come somma dei valori definitivi delle righe appartenenti alla relativa aliquota/codice.

## 5.4 Netto / Ivato

La modalità del documento deve essere persistita e rispettata.

Il cambio di rappresentazione non deve cambiare il significato economico.

Lo scorporo IVA non deve distruggere la precisione dell’unitario.

## 5.5 Sconto

La colonna è disponibile trasversalmente.

⭐ **Formato e regola sono gli STESSI in ogni documento** _(deciso 23/08/2026)_. Qui c'era «formato e regola di calcolo possono dipendere dal documento»: non è più vero, ed era la porta da cui entravano due modelli diversi.

- **Una cella sola**, a **cascata**, che accetta più valori: `5+7+10`.
- ⛔ **La notazione digitata si CONSERVA**, e si rilegge identica alla riapertura del documento salvato. Non è un vezzo: il listino fornitore «4+10» che arriva sul documento come 13,6 **non torna più indietro**, e chi riapre non sa più che sconti erano.
- Il **prezzo scontato** è una colonna a sé: è il risultato, non la sostituisce.

⚠️ **Stato al 23/08/2026**: la cascata esiste già e regge N valori (`discount-percent.util`, `5+7+10` → 20,485% esatto), e sei maschere la usano. A mancare è la **conservazione della notazione**: `SalesOrderLine.discount` è testo e la conserva, `DocumentLine.discountPercent` e `SupplierOrderLine.discountPercent` sono `Decimal(7,4)` e memorizzano solo la percentuale effettiva. Serve una colonna testo su quelle due tabelle, senza backfill — convertire 13,6 in «4+10» è indecidibile.

## 5.6 IVA

Etichetta canonica: **IVA**.

Il dato è un **Codice IVA alfanumerico**, non una quantità numerica.

La cella però consente ricerca per digitazione del codice:

- `1`
- `10`
- `22`
- ecc.

La ricerca deve dare precedenza al codice, senza confondere il fatto che si digitino cifre con il tipo del dato.

L’IVA salvata sulla riga resta fotografia.

## 5.7 Listino — da dove viene il prezzo _(deciso 23/08/2026)_

> **La sorgente del prezzo si dichiara nell'ANAGRAFICA DELLA CONTROPARTE**, e il
> documento la eredita all'apertura.

```text
VENDITA    cliente   → { prezzo articolo · listino 1 · listino 2 · listino 3 }   vuoto → prezzo articolo
ACQUISTO   fornitore → { costo articolo · prezzo fornitore }                     vuoto → costo articolo
```

**Lo stesso meccanismo per le due famiglie**, non due sistemi.

- **Se il cliente ha listino 3**, ogni documento creato per lui si apre con listino 3, e le
  righe prendono quel valore.
- **La testata ha una select** per cambiarlo, su documenti di vendita **e** di acquisto.
  Richiamando un altro listino **si ripopolano tutte le righe** col valore che ogni articolo
  ha in anagrafica per quel listino.
- **Il nome è personalizzabile** («Farmacie», «Listino Web», «Ingrosso»): è già così
  (`listino1Name`/`2Name`/`3Name` + i flag di attivazione nelle impostazioni tenant).
- ⛔ **Nessun ripiego**: un articolo senza valore per il listino scelto va a **0,00** e lo si
  segnala. Un prezzo che nessuno ha deciso non deve finire in un documento senza che si veda.
- **Senza controparte** (Vendita al banco, che il cliente non lo richiede) vale il prezzo
  articolo — ma **il selettore c'è comunque**, come su ogni altro documento.
- **Reso e Nota di credito** seguono la regola normale, **salvo quando nascono da un
  documento origine**: allora prendono le righe di quello. L'origine vince se c'è
  un'origine, non per tipo.

⏸ **Aperto**: dove vive il valore «prezzo fornitore». Oggi `SupplierVariantLink.lastPurchasePriceMinor`
è l'**ultimo prezzo pagato**, riscritto dai carichi — non un valore impostabile. Il costo
articolo si aggiorna a mano in anagrafica o all'Arrivo merce con la spunta.

---

# 6. Giacenza, Impegnata, Disponibile ed effetti

## 6.1 Grandezze

- **Giacenza** = quantità fisica.
- **Impegnata** = quantità assegnata a ordini attivi.
- **Disponibile** = Giacenza − Impegnata.

Giacenza e Disponibile possono essere negative.

L’insufficienza stock genera **warning non bloccante**.

## 6.2 Le tre spunte reali

Esistono tre effetti distinti:

### Impegna magazzino

Modifica **Impegnata**.  
Non modifica la Giacenza.

### Carica magazzino

Aumenta la **Giacenza**.

### Scarica magazzino

Diminuisce la **Giacenza**.

Possono condividere la struttura grafica della cella, ma **non sono lo stesso dato né la stessa regola**.

⭐ **Un articolo di tipo SERVIZIO non fa partire nessuna delle tre** _(deciso 23/08/2026)_: né carico, né scarico, né impegno. La spunta nasce spenta, in ogni documento.

⚠️ Regola unica, e prima non lo era: l'Ordine cliente guardava `kind === 'service' || managesStock === false`, i Documenti vendita e il banco solo `managesStock !== false`. Su un Servizio con la gestione magazzino lasciata al default davano **esiti opposti**.

## 6.3 Movimenti

Regola generale:

> una riga che produce una variazione fisica genera il proprio movimento collegato alla riga e al documento.

Una modifica aggiorna l’effetto corrente; non crea automaticamente un secondo evento fisico.

Esempi:

- quantità 3 → 2: il risultato finale deve corrispondere a 2;
- `Carica/Scarica` ON → OFF: viene neutralizzato l’effetto di quella riga;
- cambio variante: si neutralizza l’effetto sulla vecchia e si applica alla nuova;
- cambio location: si neutralizza sulla vecchia e si applica sulla nuova.

Due righe dello stesso articolo restano due righe distinte e, se movimentano, hanno due movimenti distinti.

## 6.4 Regola fisica sovraordinata

Un collegamento documentale **non autorizza mai a duplicare un effetto fisico già avvenuto**.

Il primo documento che realizza l’effetto fisico movimenta; i successivi conservano il collegamento ma non ripetono quello stesso effetto.

## 6.5 Eccezione: Vendita manuale

Lo **Vendita manuale** è una deroga esplicita:

- riduce direttamente la Giacenza;
- **non crea `StockMovement`**;
- in modifica riallinea direttamente la giacenza per differenza.

Non va normalizzato sul motore movimenti.

---

# 7. Identità della riga, modifiche e idempotenza

## 7.1 Identità stabile

Una riga salvata deve mantenere il proprio `id`.

Non si deve cancellare e ricreare l’intero insieme di righe ad ogni modifica.

- riga esistente → stesso id;
- riga nuova → nuovo id;
- riga eliminata → viene eliminata solo quella;
- riordino → cambia posizione, non identità.

## 7.2 Modifica per differenza

Quando l’operatore modifica volontariamente un documento, gli effetti tecnici devono passare dal vecchio stato al nuovo **senza applicare il documento una seconda volta**.

Questo non ricalcola la fotografia: riallinea soltanto gli effetti derivati dalla modifica esplicita.

## 7.3 Risalvataggio

Salvare due volte lo stesso stato deve produrre lo stesso risultato di un solo salvataggio.

Non devono duplicarsi:

- movimenti;
- impegni;
- righe;
- altri effetti.

## 7.4 Prima creazione

Timeout, risposta persa, doppio click o retry dello **stesso intento di creazione** non devono mai produrre due documenti.

La soluzione tecnica va verificata e resa comune; Vendita al banco può costituire un precedente se il suo meccanismo effettivo lo soddisfa.

---

# 8. Tenant e Location

## 8.1 Isolamento tenant

Ogni azienda VestiFlow deve poter leggere e modificare esclusivamente i propri dati.

Il backend deve verificare il tenant anche quando riceve un id valido.

Vale per:

- documenti;
- righe;
- prodotti/varianti;
- location;
- movimenti;
- collegamenti fra documenti;
- altri dati correlati.

## 8.2 Location

Quando la location è pertinente:

- viene persistita nel documento;
- alla riapertura si usa quella salvata;
- la location corrente della shell o la predefinita dell’operatore può essere usata solo come precompilazione iniziale;
- la precompilazione non sostituisce il dato salvato.

Giacenza e Disponibile mostrate devono essere riferite alla location pertinente.

## 8.3 Cambio location

Se l’operatore cambia volontariamente location su un documento già salvato:

- si neutralizza l’effetto sulla vecchia;
- si applica sulla nuova;
- non si duplica l’effetto.

## 8.4 Sedi disponibili

Regola generale:

- tutte le sedi del tenant possono essere visibili;
- sono selezionabili quelle consentite all’operatore.

Eccezione:

- **destinazione del Trasferimento** selezionabile fra tutte le sedi compatibili, anche se non assegnate all’operatore.

---

# 9. Numerazione comune

## 9.1 Motore comune

Quando il tipo documento prevede numerazione interna, la testata usa la grammatica:

**Data · Serie · Numero**

Il numero è proposto automaticamente da VestiFlow secondo le regole di progressione definite.

Il flusso ordinario non richiede che l’operatore digiti il numero.

## 9.2 Contatore

Il contatore è definito da:

**tenant + tipo di numerazione + serie**

La location filtra quali serie sono disponibili, ma non crea da sola un progressivo separato.

## 9.3 Serie

- può essere precompilata;
- resta modificabile quando consentito;
- al cambio location si ricaricano le serie compatibili;
- “Senza serie” deve essere una scelta reale e rispettata.

## 9.4 Data e progressione

Cambiando la Data, la proposta deve essere coerente con la regola cronologica.

Se numero/data produrrebbero un’anomalia cronologica, il sistema può avvisare al Salva senza bloccare.

## 9.5 Concorrenza

Due operatori che salvano contemporaneamente devono ricevere numeri validi e distinti senza dover risolvere manualmente la concorrenza.

## 9.6 Duplicazione

Duplicare un documento produce un nuovo documento con **nuova numerazione**.

## 9.7 Eccezioni / famiglie

- Fattura, Fattura accompagnatoria e Nota di credito condividono il progressivo della famiglia Fattura.
- Proforma ha numerazione propria.
- Ordini provenienti dai canali usano il numero del canale.
- **Corrispettivo manuale** usa la stessa logica comune di numerazione degli altri documenti.
- **Registro Corrispettivi derivato:** la regola di numerazione va definita nella sua specifica; non viene fissata qui.

La forma fiscale SdI del numero/serie resta materia del blocco Fattura elettronica.

---

# 10. Desktop, mobile e navigazione

## 10.1 Stessa regola, gesto adatto al dispositivo

Desktop e mobile applicano le stesse regole funzionali.

Può cambiare il gesto, non il risultato.

## 10.2 Desktop

- `Tab` → cella successiva secondo le colonne attive;
- `Shift+Tab` → precedente;
- `↑ / ↓` → riga precedente/successiva, conservando la colonna quando possibile;
- `← / →` → prima rispettano l’editing interno del campo dove applicabile, poi la navigazione;
- `Invio` → conferma il valore; non salva e non diventa un secondo Tab.

## 10.3 Celle di ricerca/selezione

Le voci del popup non sono fermate del Tab.

- frecce → navigazione nella lista;
- Invio/click → selezione;
- Tab → cella successiva.

I campi codice:

- Cod. articolo;
- Cod. fornitore;
- SKU;
- EAN;

confrontano il codice alla conferma secondo il motore comune.

## 10.4 Mobile

Le selezioni si fanno principalmente con il tocco.

Le stesse possibilità funzionali devono restare disponibili.

## 10.5 Una sola vista viva

Se esistono tabella desktop e card mobile, **una sola rappresentazione delle righe deve essere montata/viva nel DOM alla volta**.

Header, quick-row, tabella e card devono derivare dallo stesso contratto di colonne/celle.

---

# 11. Includi e Genera — contratto comune

Il redesign tecnico completo di Includi/Genera viene affrontato in un blocco dedicato.

Qui restano soltanto le regole già decise.

## 11.1 Includi

- porta dentro uno o più documenti esistenti compatibili;
- il documento corrente mantiene la propria testata;
- sorgenti incompatibili per cliente/tipo/stato non devono essere applicabili;
- una sorgente inclusa deve lasciare un **legame strutturato**, non solo righe copiate;
- una sorgente già consumata non deve restare disponibile come nuova.

## 11.2 Genera

- parte da un documento esistente;
- crea un nuovo documento;
- il comportamento dipende dalla **coppia origine → destinazione**;
- terminologia unica: **Includi** e **Genera**.

Non si introducono motori paralleli chiamati Converti, Concludi, Deriva o simili.

## 11.3 Effetto fisico

Vale la regola del §6.4: un effetto già avvenuto non si duplica.

## 11.4 Provenienza per riga

Il dominio richiede di poter determinare l’effetto anche **per singola riga**, perché un documento può contenere righe provenienti da origini differenti.

**Gap noto:** oggi non esiste ancora un legame canonico di provenienza riga→riga sufficiente per tutti i casi.

Non si decide qui la soluzione tecnica.

## 11.5 Relazioni già fissate

- Fattura accompagnatoria → **mai DDT**.
- Nota di credito → non usa Includi; nasce da Fattura o Fattura accompagnatoria tramite Genera.
- Vendita al banco già scaricata → Fattura/Accompagnatoria successive non duplicano lo scarico.
- DDT già scaricato → Fattura successiva non duplica lo scarico.

## 11.6 Registrazione fattura fornitore

Partecipa a **Includi** in modo specifico:

- può includere uno o più Arrivi merce;
- produce righe economiche a valore/totali;
- non trasforma gli Arrivi merce in normali righe articolo della fattura fornitore.

---

# 12. Eccezioni esplicite da non normalizzare

## Vendita manuale

Vedi §6.5: modifica direttamente la Giacenza e non crea movimenti.

## Registrazione fattura fornitore

Righe economiche, non normali righe articolo; include Arrivi merce.

## Corrispettivo manuale

Registrazione economica senza righe articolo o movimenti magazzino.

## Ordine cliente

Usa **Impegna magazzino**: modifica Impegnata, non Giacenza.

## Ordine fornitore

Non movimenta né impegna stock. Giacenza e Disponibile sono informative.

## Trasferimento

Ha origine e destinazione con semantiche differenti.

## Shopify

È un feature gate, non una variante del contratto documentale.

Tenant senza modulo Shopify: nessuna superficie Shopify visibile.

---

# 13. Prestazioni, errori e robustezza del salvataggio

## 13.1 Requisito funzionale

Il salvataggio deve restare utilizzabile anche con documenti di molte righe.

Non è accettabile una pipeline in cui il numero di round-trip cresce inutilmente per ogni riga fino a rendere il documento non salvabile.

## 13.2 Regole

- batchizzare quando semanticamente possibile;
- evitare riletture duplicate inutili;
- non sacrificare tenant, location, quantità, precisione o idempotenza per ottimizzare;
- un timeout non deve lasciare l’operatore nel caso “salvato sul server ma UI invita a creare di nuovo” senza protezione;
- i test devono verificare anche la crescita del numero di query rispetto a N righe, non solo il tempo.

## 13.3 Shopify

Il salvataggio gestionale non deve diventare fragile per l’attesa di sistemi esterni.

Worker/outbox/coda e relativa architettura restano decisioni del blocco Shopify/prestazioni.

---

# 14. Gap tecnici già individuati — da non perdere

Queste voci **non sono nuove regole funzionali**. Sono interventi/gap già emersi che devono restare tracciati.

## 14.1 Componenti e righe condivise

- completare catalogo canonico di celle/colonne;
- completare condivisione di header, quick-row e card mobile;
- eliminare duplicazioni locali non giustificate;
- a parità di `columnId`, uniformare larghezze/etichetta/configurazione base salvo override motivato;
- verificare ogni consumer documento-per-documento.

## 14.2 Quantità

- eliminare divergenze accidentali di `min`, validator e step;
- il documento passa la propria policy alla cella comune.

## 14.3 Precisione costo

- completare l’allineamento `NUMERIC(16,6)` end-to-end;
- migrare le colonne di costo unitario che oggi perdono precisione;
- eliminare `Math.round`, `@IsInt()` e altre conversioni premature solo nello stesso passaggio in cui lo schema diventa capace di conservare il valore;
- distinguere costi unitari/intermedi da totali finali.

## 14.4 Shopify price

Regola da preservare:

- al primo inserimento, se `shopifyPriceMinor` è vuoto, può essere seedato dal Prezzo articolo;
- se è già valorizzato, modificare il Prezzo articolo non deve sovrascriverlo;
- un prezzo Shopify esplicitamente inserito prevale;
- niente sincronizzazione permanente fra i due campi;
- non inventare zero quando entrambi sono assenti.

## 14.5 Fattura normale — scarico

Regola funzionale:

- creazione diretta → `Scarica magazzino` ON;
- da Preventivo → ON;
- da Ordine cliente → ON;
- da DDT già scaricato → OFF sulle righe provenienti dal DDT;
- da Ordine Shopify già scaricato → OFF;
- da Vendita al banco già scaricata → OFF.

La corretta applicazione per riga dipende dal futuro lavoro sulla provenienza riga.

## 14.6 Fattura accompagnatoria

- non include mai DDT;
- eventuali guardie DDT nel codice possono restare come difesa contro dati/percorso invalido, ma non devono diventare una relazione ammessa;
- se deriva da un documento che ha già realizzato la stessa uscita fisica, non duplica il movimento.

## 14.7 Nota di credito

- nasce da Fattura/Fattura accompagnatoria;
- `Carica magazzino` per riga, default OFF;
- se ON, genera il rientro fisico con aggiornamento per differenza e idempotenza;
- servizi/righe economiche senza variante non movimentano;
- **Fattura elettronica prevista: TD04**;
- implementazione FE non ancora completa: da affrontare nel blocco Famiglia Fattura / FE;
- nessun ingresso diretto DDT → Nota di credito.

## 14.8 Costi nei movimenti / inventario

Restano da verificare e correggere i difetti già emersi:

- DDT/Accompagnatoria con costo unitario mancante/null nei movimenti;
- punti in cui l’inventario usa erroneamente il prezzo di vendita come costo;
- compatibilità con la nuova precisione Decimal.

## 14.9 Idempotenza prima creazione

Rendere comune la protezione contro duplicazione dello stesso intento di creazione, verificando prima i precedenti già implementati.

## 14.10 Includi/Genera

Gap noto di provenienza riga.

Non progettare ora una FK/campo nuovo per deduzione: prima censire tutti i legami esistenti e il motore reale.

## 14.11 Seriali

Stato **aperto**: ricostruire dominio, persistenza, selezione, carico/scarico e relazione con quantità prima di fissare il contratto comune.

---

# 15. Metodo di applicazione documento-per-documento

Dopo questo Blocco 0, ogni documento viene ricostruito con una specifica autosufficiente.

Per ciascun documento:

1. regola richiesta;
2. comportamento osservato;
3. causa radice delle divergenze;
4. componenti comuni utilizzabili;
5. eccezioni di dominio;
6. UI desktop/mobile;
7. API;
8. database;
9. quantità;
10. movimenti / impegni;
11. idempotenza;
12. tenant;
13. location;
14. Includi/Genera ammessi;
15. modifica/eliminazione;
16. criteri di accettazione e test.

Prima si chiude la specifica funzionale; poi si confronta il codice e si classifica ogni area come:

- conforme;
- divergente;
- mancante;
- legacy/superata.

Solo dopo si prepara l’intervento tecnico.

---

# 16. Decisioni volutamente lasciate aperte

Non vanno chiuse per deduzione durante l’implementazione:

- modello comune dei **Seriali**;
- soluzione tecnica della provenienza riga per Includi/Genera;
- eventuale architettura worker/outbox Shopify;
- dettaglio tecnico dell’idempotenza comune della prima creazione;
- regola di numerazione del **Registro Corrispettivi derivato**;
- parti ancora incomplete della Fattura elettronica, inclusa la piena gestione TD04;
- Rettifica/Inventario: revisione funzionale rinviata al loro blocco dedicato.

---

## Fonti consolidate

Documento costruito consolidando le regole e le verifiche contenute in:

- `00-DECISIONI.md`
- `03-specifica-unificazione-righe-documento.md`
- `03b-mappa-tecnica-righe-documento.md`
- `04-specifica-numerazione-documenti.md`
- `09-specifica-movimenti-per-riga.md`
- `12-specifica-collegamenti-documentali.md`
- `13-specifica-prestazioni-salvataggio.md`
- `CORE-FORM-DOCUMENTO.md`
- `MATRICE-MASCHERE-DOCUMENTO.md`
- decisioni più recenti confermate dal proprietario nel consolidamento del 22/08/2026.

Le decisioni più recenti confermate prevalgono su comportamento osservato, codice attuale e testi storici incompatibili.
