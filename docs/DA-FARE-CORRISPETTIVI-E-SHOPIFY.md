# Cosa resta da fare — corrispettivi, resi e sincronizzazione Shopify

**Aggiornato:** 15/08/2026, notte
**Ramo:** `numerazione-documento-2` (si continua su questo; contiene tutto `develop` + 33 commit — non `main`, che è 205 commit più indietro e gira la produzione)
**A che serve:** riprendere il lavoro in un'altra sessione **senza ricostruire niente**. Ogni voce dice cosa è già misurato, cosa è deciso e cosa no.

---

## Prima di toccare qualsiasi cosa: tre fatti che cambiano come si legge tutto

### 1. I webhook di Shopify vanno in PRODUZIONE, non sulla macchina di sviluppo

Le sette sottoscrizioni puntano a `https://vestiflow-production.up.railway.app`, che gira **`main`**, sullo **stesso database** di sviluppo.

| Chi provoca il fatto                         | Chi lo esegue       | Con quale codice |
| -------------------------------------------- | ------------------- | ---------------- |
| un gesto su Shopify (ordine, evasione, reso) | ambiente pubblicato | `main`           |
| un pulsante nell'app locale                  | API sulla macchina  | il ramo corrente |

**Conseguenza pratica**: una correzione su questo ramo non entra in gioco finché qualcuno non preme un pulsante. Chi guarda il database vede il risultato della produzione e rischia di attribuirlo al proprio lavoro — **è già costato un errore** il 14/08 (la sede di scarico, dichiarata «corretta» guardando un movimento prodotto in realtà dal ripiego di `main`).

Dettaglio in `02-specifica-sincronizzazione-shopify.md` §4.11.

### 2. Il grado di certezza si dichiara, e sono tre

**letto** (ho letto la riga di codice) · **dedotto** (segue dallo strumento, non l'ho visto) · **provato** (eseguito sul sistema vero, database letto prima e dopo).

Quella che si perde più facilmente è la differenza fra le prime due: un'analisi di codice produce «letto», e il «quindi succede X» è **dedotto**.

### 3. Il database è condiviso col collega

Solo `npm run prisma:deploy`, mai `migrate dev` né `db push`. Migration scritte a mano. Ogni tabella nuova porta RLS e `REVOKE` nella stessa migration.

---

## Cosa è stato chiuso il 14/08 — non va rifatto

Diciassette commit, tutti su albero verde (1512 test API, lint completo, type-check di entrambi i lati). **Niente push, niente deploy.**

**Il registro corrispettivi è finito e funziona così:**

- è **derivato** da vendite e rettifiche — `corrispettivo_entries` non viene più scritta dal ramo;
- conta le vendite alla **data di evasione**; un ordine mai spedito non entra, un annullamento pre-evasione resta fuori da sé;
- **sottrae le rettifiche alla loro data**, saltando gli annullamenti;
- l'elenco mostra le rettifiche come **righe negative**: il totale in fondo si ricostruisce sommando la colonna;
- si filtra per **periodo di calendario** (mese, trimestre, anno precisi), **canale** e **tipo**, indipendenti fra loro;
- **CSV, Excel e PDF** usano lo stesso dataset della schermata e si riconciliano col proprio totale;
- è quello che l'operatore trova su **«Corrispettivi» in sidebar**; `/app/reports/corrispettivi` fa redirect.

**Riconciliazione di agosto 2026**, verificata per tre strade indipendenti:

```
venduto      411,02
rettifiche  −205,01
annullamenti      0     (vendite mai avvenute)
─────────────────────
corrispettivo 206,01
```

**Quattro difetti corretti**, tutti trovati con ordini costruiti apposta: la sede di scarico (`01` §3.8), l'IVA della spedizione nei rimborsi (`08` §4), il registro che contava merce mai partita (`01` §2.16), l'imposta di riga ridistribuita (`01` §3.12).

---

## Da fare, in ordine

### 1. ⭐ Procedura di prima sincronizzazione — **mai entrata in `docs/`**

È il lavoro più grande e blocca gli altri due. Deve contenere, oltre a quanto già discusso altrove:

- **la corrispondenza fra aliquota Shopify e Codice IVA di VestiFlow.** Oggi le righe importate portano `{"ratePercent": 22, "matched": false}` — l'aliquota osservata, **senza** codice interno. È deliberato: il dato del canale si conserva subito, la corrispondenza è una decisione. Senza di essa il **filtro per aliquota** non può tornare nel registro, perché sarebbe solo un'etichetta;
- **l'aggancio delle location**, che è il prerequisito per leggere le _fulfillment orders_ e chiudere il ripiego alfabetico sull'impegno (`01` §3.8, parte ancora aperta);
- il resto del disegno in `02-specifica-sincronizzazione-shopify.md`, che è **disegno e non consuntivo**.

### 2. Specifica sedi

Ferma dalla mattina del 14/08. Non ci sono misure nuove da riportare.

### 3. Eliminazione di `corrispettivo_entries` — rilascio a sé

Il passaggio 1 è fatto: nessuna UI la legge, nessuna scrittura la alimenta dal ramo. **Manca solo il passaggio distruttivo**, e va fatto in un rilascio separato perché il database è condiviso:

- `DROP` di `corrispettivo_entries` e `corrispettivo_entry_lines`;
- endpoint `/online-sales/register/entries`, componente `corrispettivi-register`, DTO e mapper legacy;
- `DocumentType.corrispettivo` **solo se** un censimento conferma zero consumer: oggi resta nella configurazione (prefisso `COR`, etichetta, famiglia permessi), ed è solo la **numerazione** a non essere più consumata.

⚠️ **Prima del DROP**: `main` in produzione **scrive ancora** quelle tabelle a ogni evasione. Finché non è rilasciato questo ramo, eliminarle romperebbe la produzione.

---

## Difetti aperti, misurati e non ancora corretti

| Rif.       | Difetto                                                                          | Stato                                                                          |
| ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `01` §3.9  | Le righe importate ignoravano lo sconto: 120,00 di righe su un ordine da 104,00  | ✅ **chiuso e provato** su `#1010`/`#1011` (15/08)                             |
| `01` §3.13 | Il Codice IVA della vendita online lo sceglieva l'imposta incassata, mai lo zero | ✅ **chiuso** — non ancora eseguito in produzione (scatta all'evasione)        |
| `01` §3.14 | La sync sedi partiva da sola, da tre punti, e creava/rinominava/cancellava       | ✅ **inneschi spenti** — il servizio (nome, creazione automatica) resta aperto |
| `01` §3.15 | Le righe di canale scrivono importi IVATI in colonne lette come NETTE            | aperto — scelta di modello, non ancora presa                                   |
| sotto      | Ordine cliente: sconto a importo, sconto extra a importo, spedizione sui manuali | aperto — disegno deciso, non implementato                                      |
| `01` §3.12 | **Le righe della Vendita online** portano ancora l'aliquota media inventata      | l'import è corretto, lo **snapshot** no                                        |
| `01` §3.11 | Vendita con una riga non scaricata dichiara «scarico completo»                   | aperto                                                                         |
| `01` §3.8  | L'**impegno** usa ancora il ripiego alfabetico sulla sede                        | chiuso solo lo scarico, e mai eseguito                                         |
| `01` §2.1  | `orders/cancelled` non registrato sul negozio                                    | da fare **dall'ambiente pubblicato**                                           |
| `01` §2.14 | Il reso dichiarato e non ancora elaborato non esiste per VestiFlow               | aperto, da decidere se coprirlo                                                |

## Novità della notte del 15/08 — da leggere prima di riprendere

**Fatto, provato, committato** — 5 commit sul ramo, tutti verdi (961+418 frontend, 1527 API):

1. Sconto di riga Shopify — si legge da `discount_allocations`, mai si ricalcola. Provato su due ordini costruiti apposta, uno con sconto a importo.
2. Codice IVA della vendita online — si aggancia solo se univoco; mai a zero, mai con più codici alla stessa aliquota.
3. Maschera Ordine cliente — su un ordine di canale il riepilogo si legge dalla testata (spedizione, sconto, imponibile per differenza), non si ricalcola col motore manuale.
4. Sedi — i tre inneschi automatici sono spenti. Il pulsante manuale resta.

**Deciso ma non implementato — è il prossimo lavoro sull'Ordine cliente.** Una banda unica in entrambi i documenti (manuale e Shopify), con questi campi editabili in tutti e due:

```
Totale prodotti
Sconto ordine        ← dal canale, sola presa d'atto · 0,00 sui manuali
Sconto extra   [ 0% ]
Sconto importo [ 0,00 ]   ← NUOVO, colonna additiva su sales_orders
Spedizione            ← NUOVO su tutti e due i documenti
Imponibile
IVA
Totale documento
```

Decisioni prese, da non riaprire:

- l'importo del canale (`discountMinor`, esiste già) resta **distinto** dal nuovo campo che scrive l'operatore — altrimenti il sync lo cancellerebbe al prossimo giro;
- ordine di applicazione: **prima la percentuale, poi l'importo**;
- l'IVA dell'importo si ripartisce sulle righe in proporzione, come già fa la percentuale — **tranne** sulle righe Shopify, dove l'allocazione del canale non si ricalcola mai;
- **su un ordine Shopify il campo sconto importo diventa editabile**: resta pieno col valore del canale finché l'operatore non lo tocca. Da decidere il comportamento al prossimo sync — oggi la maschera di un ordine di canale è di sola lettura su tutto il resto, e questo campo ne uscirebbe da solo;
- migration: colonna additiva `document_discount_minor` su `sales_orders`, scritta a mano, `prisma:deploy`.

**Non deciso, resta il §3.15.** Se scorporare i prezzi Shopify a netto all'import (come fa già il catalogo) o dichiarare che le colonne dell'ordine di canale sono lorde. `PREZZI-SHOPIFY-SPEC.md` §1-bis e §4.1 la analizzano dal 7 agosto; i rimborsi la applicano già (leggono `taxes_included`), l'import degli ordini no — stessa cartella, stesso payload, due dottrine.

**La fase iniziale di collegamento Shopify** _(deciso il 15/08, sospesa)_. Le sedi si agganciano **a mano** — non più solo per nome — quando esistono già da entrambe le parti; ogni sede completa i propri dati (indirizzo, impostazioni); e questo passo sta insieme all'assegnazione del Codice IVA ai prodotti importati (`02` §4.1-4.3). Non è più «poi un avviso»: è il lavoro descritto lì, ed è il più grande dei tre rimasti.

**Topologia del ramo, verificata il 15/08.** `numerazione-documento-2` contiene **tutto `develop`** più 33 commit — non diverge, è un fast-forward pulito (6 migration, tutte aggiunte pure). È `main` a essere 205 commit indietro rispetto a `develop`, ed è `main` che gira in produzione su Railway sullo stesso database condiviso. Il merge previsto è su `develop`: il rischio di migration incrociate descritto per `main` non si applica a questo passaggio.

Sul §3.12: la **correzione all'import è provata sui dati veri** (righe d'ordine riscritte con 2,31 al 4% e 4,51 al 22%). Restano sbagliati gli **snapshot** già scritti — `VO-2026-0004`, `VO-2026-0005`, `COR-2026-0005/0006` — e **non si toccano**: sono istantanee, e sono l'unica testimonianza rimasta del difetto.

---

## Decisioni prese che NON si riaprono

- Il registro corrispettivi è **derivato dalle vendite**; `corrispettivo_entries` cade _(11/08, riconfermata 14/08)_.
- **Il passato non si riscrive, si rettifica**: la vendita resta alla sua data, il reso arriva alla propria _(base normativa riferita: Ris. 274/E/2009)_.
- **Gli annullamenti non si filtrano**: un annullamento pre-evasione non ha data di evasione e resta fuori da sé. Filtrarli farebbe sparire retroattivamente una vendita già avvenuta.
- **I rimborsi da annullamento si conservano e si classificano**, non si scartano in scrittura: è il registro a decidere se un fatto ha effetto, non la traduzione a decidere se esiste.
- **Canale predefinito «Tutti»**: un totale gonfiato si nota, uno a cui manca una parte no.
- **Il filtro Tipo agisce sull'elenco, non sul riepilogo**: guardando «Solo resi» il totale deve continuare a dire il corrispettivo del periodo.
- `exclusionReason` **si deriva dal legame** con la fattura; `fiscalDate` modificabile **cade**.

## Limite noto, dichiarato e non aggirato

Il registro usa la **data di evasione**, che è la regola ordinaria per le cessioni di beni mobili. Non è la regola completa: l'art. 6 anticipa il momento di effettuazione se il corrispettivo è pagato prima della consegna — cosa che su un ordine incassato con carta accade quasi sempre.

**VestiFlow non può derivarlo oggi**: _misurato_, nessuna data di incasso è persistita, le transazioni del canale non si importano. Manca il dato, non la logica. La formulazione da usare è «per il flusso supportato oggi il registro usa la data di evasione», **non** «la data di evasione è la data fiscale».

---

## Come si verifica una modifica su questo ramo

1. **Il percorso del pulsante è locale**: «Sincronizza vendite» esegue il codice del ramo, e una correzione all'import si può provare così.
2. **Il percorso dell'evento no**: evasione, rimborso e reso li elabora la produzione. Provarli richiede i webhook puntati a un tunnel.
3. **Il caso di prova deve essere quello scomodo.** Il difetto dell'IVA è vissuto per mesi perché con **una sola aliquota** la ripartizione proporzionale coincide col vero: qualunque verifica sarebbe passata. È emerso con un ordine costruito con 4% e 22% insieme.
4. **Si fotografa il database prima e dopo**, e si aspetta che il pulsante torni premibile: misurare a passata in corso è già capitato due volte.
