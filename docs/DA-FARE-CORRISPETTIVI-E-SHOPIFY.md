# Cosa resta da fare — corrispettivi, resi e sincronizzazione Shopify

**Aggiornato:** 15/08/2026, notte
**Ramo:** `numerazione-documento-2` (si continua su questo; contiene tutto `develop` + 33 commit — non `main`, che è 205 commit più indietro e gira la produzione)
**A che serve:** riprendere il lavoro in un'altra sessione **senza ricostruire niente**. Ogni voce dice cosa è già misurato, cosa è deciso e cosa no.

---

## ⚠️ Leggere prima: la specifica del Registro è cambiata il 16/08/2026

Esiste ora **`10-specifica-registro-corrispettivi.md`**, ed è la fonte corrente. Tre cose
che questo file dava per assodate non lo sono più:

1. **Nessun flusso «commercialista».** Consegne, invii e registrazioni sono stati
   rimossi — codice, UI e persistenza. Periodo → filtri → stampa/export → fine.
2. **Shopify POS compare nel Registro** come vendita fisica/POS. Non si esclude: si
   classifica, e la classificazione viene da `source`.
3. **`SalesOrderFiscalStatus` non esiste più**, colonna e tipo PostgreSQL. Non è stato
   sostituito.

E una che era scritta qui e altrove ed era falsa: **`CorrispettivoEntry` non è la sorgente
del Registro** — quella tabella non viene più scritta dall'11/08, e le sue righe residue
sono storia. Non ci si deduce la logica nuova (`10` §7).

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

### 2-bis. ✅ Il Corrispettivo manuale è costruito — 17/08/2026

**Fatto.** Entità, API, innesto nel Registro, colonna e filtro Sede, colonna origine e
dettaglio IVA nell'export, maschera di creazione/modifica/eliminazione, con le prove del
`10` §13. Il consuntivo della costruzione — le sette cose che il §13 non prevedeva, e cosa
resta — è in **`10` §14**.

⚠️ **La guida utente è stata aggiornata insieme** (§15). Qui sotto resta il testo di allora,
perché dice ancora _cosa_ doveva entrarci e serve a rileggerlo con occhio critico.

_Testo del 17/08, prima della costruzione:_

`GUIDA-UTENTE-VESTIFLOW.md` §15 «Corrispettivi» oggi **è ancora esatta** — verificato il
17/08: descrive il quadro economico per periodo, non nomina la verticale ritirata, e non
descriveva nemmeno il pulsante export doppione che è stato spento. Non c'è niente da correggere
adesso, e scrivere in guida una funzione che non c'è è peggio che non scriverla.

**Cosa andrà aggiunto quando la maschera sarà pronta**, in §15 subito dopo «Come si usa»:

- il pulsante **«+ Aggiungi corrispettivo»** e a cosa serve — i quattro casi reali (cassa
  esterna durante un guasto, vendite non ricostruibili, differenza di chiusura, importi
  storici), detti con parole da operatore;
- che è una registrazione **solo economica**: non tocca il magazzino, non crea prodotti;
- righe `Descrizione · Importo · Codice IVA`, più aliquote nella stessa registrazione;
- il selettore **Ivati/Netti**, che parte da Ivati perché si copiano i valori della cassa;
- che si può **correggere ed eliminare**, e che eliminando resta un buco nella numerazione —
  è normale e non si rinumera niente;
- la colonna **Location** e il perché di **«Non determinata»** sulle righe Shopify, con la
  riga che dichiara quante ne restano fuori quando si filtra per sede.

⚠️ E va aggiornata anche la tabella dei permessi di §15: la scrittura sul Registro passa da
`reports.fiscal_register`, la cui descrizione parla ancora di «marca le consegne al
commercialista» — flusso **ritirato**. Quel testo va riscritto quando il permesso viene usato
davvero: oggi non lo usa nessuna rotta.

### 2. Specifica sedi

Ferma dalla mattina del 14/08.

#### ⚠️ Lacuna registrata il 17/08: la Location Shopify non è strutturalmente affidabile

> **La Location delle vendite e delle evasioni Shopify deve essere sempre determinata in modo
> affidabile, e non deve dipendere da ripieghi arbitrari.**

Emersa costruendo il **Corrispettivo manuale** (`10` §12), che porta la colonna Location dentro
il Registro Corrispettivi. Misurata, non ipotizzata:

- `SalesOrder.locationId` **esiste ma è della sola testata manuale**, e la sync non lo scrive
  mai — né in `orderData` né nel `create`. Per gli ordini di canale il Registro può leggere la
  location **solo** dalla Vendita online;
- `OnlineSale.locationId` **è nullable**, e la sync passa una location all'evento solo se ci
  sono righe impegnabili;
- dove il valore c'è, **può essere stato indovinato**: se la sede Shopify non è mappata,
  `resolveShopifyOrderLocationId` ripiega sulla **prima sede licenziata in ordine alfabetico**
  (`orderBy: { name: 'asc' }`). Il danno è già stato misurato una volta e sta scritto nel
  codice: «Shopify spediva da _Shop location_, VestiFlow scaricava da _Magazzino test 3_ —
  prima per la M»;
- la relazione è `onDelete: SetNull`: il dato **si perde** se la sede viene eliminata.

⚠️ **Il punto che conta**: il valore letto **non porta con sé se sia stato dichiarato dal canale
o indovinato**. Chi lo legge non può distinguere i due casi.

**Nel frattempo il Registro dice «Non determinata»** e non inventa niente — è un'**anomalia
temporanea dichiarata**, non uno stato del modello (`10` §12). Quando questa lacuna sarà
chiusa, quella dicitura deve sparire da sé.

**Non si tocca la sync adesso**, per decisione esplicita del 17/08: il Corrispettivo manuale non
si blocca per sistemare Shopify. Questo caso si affronta qui, nel blocco sincronizzazione.

### 3. ✅ Eliminazione di `corrispettivo_entries` — **fatta il 17/08/2026**

Migration `20260817140000_ritira_corrispettivo_legacy`, applicata. Sono caduti: le due tabelle e i loro dati (6 voci, 11 righe, tutte ferme al 14/08 alle 20:53), la riga di numeratore rimasta, gli endpoint `/online-sales/register/entries`, il servizio, i DTO, la maschera `corrispettivi-register`, i mapper, `CorrispettivoEntryStatus` e `DocumentType.corrispettivo` **dal codice**.

⚠️ **Il valore resta morto nel tipo PostgreSQL**, ed è deliberato: `ALTER TYPE … DROP VALUE` non esiste, e ricostruire il tipo significherebbe riscrivere ogni colonna che lo usa. Stessa scelta già fatta il 16/08 per `externally_registered`. La guardia `check:registro` copre ora **26** termini e impedisce che rientri nel codice.

**Il rischio è stato messo a verbale e accettato**: `main` — che gira su Railway — scriveva ancora quelle tabelle a ogni evasione, quindi fino al rilascio di questo ramo un ordine evaso su un negozio collegato manda in rollback l'intera transazione. Nessun tenant è in produzione vera.

**Prima di eliminare è stato fatto un censimento** (`10` §11) per verificare che non stesse cadendo anche una funzione utile: la registrazione manuale economica in stile Danea. Verdetto **A** — era solo il duplicatore automatico. Da lì nasce il **Corrispettivo manuale** (`10` §12), che è funzione nuova, non un ripristino.

---

## Anagrafica articolo — deciso il 17/08, in parte fatto

### ✅ Fatto: il campo si chiama «Prezzo di vendita», ovunque

Lo stesso dato (`sellingPrice`) si chiamava in **cinque** modi: «Prezzo al pubblico» in Arrivo
merce e Ordine fornitore, «Prezzo articolo» in anagrafica e dettaglio, «Prezzo vendita» nel
passo varianti e nel riepilogo, «Prezzo» nelle tabelle strette, «Prezzo unitario» nei movimenti.

**29 sostituzioni in 15 file** più le prove e i documenti. Scelto **«Prezzo di vendita»** e non
«Prezzo al pubblico» — che pure era già il nome in due maschere — perché «al pubblico»
presuppone il dettaglio, e la convenzione aziendale netto/ivato appena introdotta ammette
esplicitamente che l’azienda possa ragionare all’ingrosso.

**Restano fuori di proposito:**

| Cosa                                                  | Perché                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| «Prezzo netto» / «Prezzo ivato» nelle righe documento | è la **modalità**, la scrive `priceModeRowLabel` e cambia da sola     |
| «Prezzo» secco nelle colonne strette                  | il contesto è già la riga, e allargare la colonna non aggiunge niente |
| «Prezzo unitario» nei movimenti                       | è il valore dell’**evento**, non il prezzo di catalogo                |
| «Prezzo barrato», «Prezzo Shopify»                    | sono altri prezzi, e si chiamano già bene                             |

### ✅ Fatto il 17/08: il prezzo barrato è un prezzo di vendita come gli altri

Era l’unico dei sei a ignorare il selettore netto/ivato, **in silenzio**. Adesso è in
`PRICE_FIELDS`, la colonna è `Decimal(16,6)` e il valore memorizzato è il netto canonico.

⚠️ **I 6 valori esistenti sono stati portati a `NULL`**, non a zero — il barrato è facoltativo
e zero direbbe «esiste e vale zero». Misurati prima: 6 prodotti su 250, tutti dello stesso
tenant di prova, tutti al 22%, coi nomi che lo dicono («test import listini», «The Compare at
Price Snowboard»). `Int → Decimal` è senza perdita **numerica**, ma la **semantica** cambiava:
un 70,00 scritto intendendo «ivati» sarebbe stato riletto come netto e mostrato 85,40.

**Difetto trovato dalle prove, non dall’occhio:** `currentDraft()` riscriveva cinque prezzi dal
netto canonico e lasciava passare il barrato **grezzo** dal form. Con il campo dentro
`PRICE_FIELDS` ma fuori da lì, il valore digitato non veniva mai scorporato.

`buildVariantsPayload` è stata estratta dal servizio di push in una util propria — era un
metodo privato che non usava `this`, e **nessuna prova la copriva** mentre decide due valori
che finiscono sotto gli occhi del cliente. Nove prove, fra cui quella che `null` non diventa
`0.00`.

#### ✅ Fatto: anche l’Arrivo merce

Le sue tre colonne di vendita — Prezzo di vendita, Prezzo barrato, Prezzo Shopify — **non
seguivano nessuna modalità**: si scrivevano e si rileggevano grezze, quindi nette senza dirlo.
E siccome la convenzione predefinita è ivata, in anagrafica si digitava ivato e qui lo stesso
numero finiva netto: **due schermate, stesso prezzo, due significati.**

Adesso hanno **un solo stato** netto/ivato, distinto da quello dei costi:

```text
salesPricesIncludeVat (tenant)  →  semina lo stato di sessione  →  il selettore lo cambia
                                                                →  nessuna persistenza
```

⚠️ **Seminato, non letto ogni volta.** Leggere la convenzione a ogni conversione avrebbe reso
la modalità **fissa**, e il selettore un comando che non comanda.

⚠️ **E non passa da `resolvePricesIncludeVat`**: l’Arrivo merce è un documento di acquisto,
quindi quella catena gli risponde `false` per costruzione. La convenzione arriva dal tenant,
che il componente aveva già iniettato.

**Il costo resta separato**, con la sua modalità di documento: concorre al totale, questi tre
no — sono dati dell’ARTICOLO che passano di qui, ed è la seconda porta che scrive l’anagrafica.

**Difetto trovato dalle prove, non dall’occhio:** al primo tentativo i netti venivano letti
**dopo** aver cambiato modalità, e il giro diventava un’identità — il campo non si muoveva di
un centesimo e la modalità cambiava solo di nome. Adesso si leggono prima e si riscrivono dopo,
come nell’Ordine cliente.

Nove prove, fra cui le sette chieste: azienda ivata e netta, i tre campi che si muovono
insieme, prezzi e costo che non si toccano a vicenda, il giro senza deriva, il campo vuoto che
resta vuoto. Mutazione: rimesso l’ordine sbagliato, due prove si accendono.

### ✅ Fatto il 17/08: «Prezzi di vendita» e «Listini» sono due sezioni

> **Un listino non è un altro prezzo: è una regola commerciale alternativa** — Ingrosso,
> Rivenditori — che assegna un prezzo diverso allo stesso articolo.

```text
Prezzi di vendita    Prezzo di vendita · Prezzo barrato · Prezzo Shopify (se attivo)
Listini              Listino 1 · 2 · 3        (nomi dati in Impostazioni)
(fuori)              Costo di riferimento (netto)
```

**Un solo selettore netto/ivato** per tutta l’area prezzi: sta nella testata della prima
sezione e governa tutti e sei i campi. Il costo è fuori, e adesso **lo dice l’etichetta** —
il tooltip diceva già «sempre al netto d’IVA», ma restava nascosto.

**Il barrato è salito** dalla coda della scheda, dove stava accanto al costo: è una componente
della politica di vendita, non un dato amministrativo. Era la parte di impaginato del lavoro,
non di parole.

⚠️ **E le due schermate adesso dicono la stessa cosa:** in Impostazioni i tre si chiamano
«Listini aggiuntivi», qui «Listini» ne indica esattamente tre. Prima ne indicava cinque.

Tre prove tengono la struttura: le due testate esistono, il barrato e il prezzo Shopify stanno
con il prezzo di vendita, e il costo dichiara la sua base.

### ✅ Fatto il 17/08: frecce e rotella dei campi numerici

**Frecce tolte solo dai campi di DENARO**, con una regola globale e **zero template toccati**.
La discriminante non è una classe da ricordare: è `inputmode`, che il codice già dichiara per
la tastiera del telefono.

```text
inputmode="decimal"    8 campi  →  tutti e soli i prezzi   ← la regola prende questi
inputmode="numeric"   12 campi  →  conteggi, frecce restano
inputmode assente     12 campi  →  conteggi, frecce restano
```

**Rotella spenta ovunque**, e il CSS non poteva farlo: `appearance: textfield` toglie le frecce,
la rotella resta. Un ascoltatore solo in cattura sul documento
(`core/services/number-input-wheel-guard.ts`), non una direttiva — una direttiva su
`input[type=number]` andrebbe importata in venti componenti standalone, e nel ventunesimo
dimenticata. Toglie il **fuoco** invece di annullare l’evento: `preventDefault` fermerebbe anche
lo scorrimento della pagina.

⬜ **Resta una sola cosa, piccola:** le **cinque** card di riga nascondono le frecce per conto
proprio, 6 righe SCSS ciascuna. Deciso il 17/08 che la regola giusta **non** è «nelle card
mobili si nascondono» ma:

> **Quando la quantità ha uno stepper esplicito − / valore / +, le frecce native si nascondono.**

⚠️ E non vanno consacrate «approvate mobile» le altre quattro maschere: **solo l’Ordine cliente**
è stato progettato e validato per mobile. L’estrazione deve centralizzare **soltanto** le regole
degli spinner, senza toccare bordi, radius o larghezze delle cinque card.

_In futuro − / input / + dovrebbe diventare un piccolo componente condiviso: quello sì è un
elemento ricorrente e funzionale._

## Prima sincronizzazione Shopify — deciso il 17/08/2026, da progettare

### 1 · `catalogOrigin` diventa provenienza, non permesso

> **Dopo che import e sincronizzazione sono completati, un articolo è di VestiFlow _e_ di
> Shopify: si distingue per come funziona e da dove nasce, ma si gestisce come tutti gli altri.**

Oggi non è così: `catalogOrigin = shopify` mette l’articolo in sola lettura. Misurato il
17/08: **87 articoli su 250, il 35% del catalogo.**

Il blocco vive in **17 punti**:

```text
API        catalog-origin.util · products.service · product-media.service
           shopify-product-push.service
FRONTEND   product-form + i tre step (general/options/variants) + detail
           i model, i mapper, catalog-origin.util
```

⚠️ **Il push NON è il problema, ed è bene saperlo prima di progettare.** Misurato: la guardia
del push (`evaluatePushGuard`) controlla connessione, scope `write_products`, prodotto non
archiviato e spunta `shopifySyncEnabled` — **non guarda `catalogOrigin`**, e il commento nel
codice lo dice: _«Gate per-prodotto: in AND col gating per origine»_. Se una modifica riesce a
salvarsi, viene spinta. Quindi togliere il blocco **non** lascerebbe le modifiche a metà strada.

Quello che serve progettare è l’altra metà: **cosa succede quando i due lati cambiano lo stesso
campo**. «Ultimo che scrive vince» è la direzione decisa, ma va reso vero — e riguarda i campi
che il canale possiede davvero (nome, descrizione, categoria, tassonomia, identità delle
varianti), non i prezzi.

✅ **Il prezzo di vendita è già uscito da qui il 17/08**, perché non è un campo del canale: a
Shopify va `shopifyPrice`, un’altra colonna. Sbloccarlo non anticipava nessuna decisione.

### 2 · Prezzo interno a zero all’import — idea da valutare

Il problema è già misurato e sta nella `PREZZI-SHOPIFY-SPEC`:

> `shopifyDecimalToMinor` restituisce **0** su valore malformato o assente, e il chiamante passa
> `variant.price ?? '0'`. Un prezzo mancante su Shopify diventa un prezzo di vendita **zero** in
> VestiFlow, senza errore.

E resta zero **per sempre**, perché il meccanismo è asimmetrico per costruzione:

| Momento                    | `sellingPrice`                        | `shopifyPrice` |
| -------------------------- | ------------------------------------- | -------------- |
| **nascita** (primo import) | scritto                               | scritto        |
| **ri-sync**                | ⛔ **mai toccato** — è dell’operatore | aggiornato     |

Quindi: articolo importato quando Shopify non aveva prezzo → interno a 0. Shopify poi il prezzo
ce l’ha → il ri-sync aggiorna solo il suo → **l’interno resta 0 e nessuno lo rialza**.

**L’idea:** quando il prezzo interno manca o è zero, si compila con il prezzo Shopify.

**Da determinare:**

- vale **solo alla prima volta**, o ogni volta che l’interno è zero? La seconda forma è più
  utile ma è una scrittura automatica su un campo dichiarato dell’operatore: va detto
  esplicitamente che «zero» conta come «non ancora deciso» e non come «deciso zero»;
- e il caso opposto — l’operatore che **vuole** un articolo a zero — come si distingue?

**Più un comando esplicito**, che è la parte senza ambiguità: nell’elenco prodotti, dopo aver
filtrato e selezionato, un pulsante **«Copia il prezzo Shopify nel prezzo interno»**. Copre lo
storico già andato storto, e non indovina niente: lo decide l’operatore su ciò che ha scelto.

⚠️ La forma automatica e il pulsante **non sono alternative**: il pulsante serve comunque per
gli articoli già a zero oggi, qualunque cosa si decida per l’import futuro.

### 3 · «Listini» in anagrafica: il nome vale per un sottoinsieme

La sezione prezzi dell’anagrafica si intitola **«Listini»** e contiene cinque campi:

| Campo               | È un listino?                  |
| ------------------- | ------------------------------ |
| **Prezzo articolo** | ⛔ no — è _il_ prezzo          |
| **Prezzo Shopify**  | ⛔ no — è il prezzo del canale |
| Listino 1 · 2 · 3   | ✅ sì                          |

**Il criterio per escludere lo dà già il codice**, in un commento di quella stessa sezione:
_«Barrato e costo di riferimento restano fuori: non sono listini»_. Applicato agli altri due,
esclude anche loro.

⚠️ **E le due schermate già non si capiscono fra loro:** in Impostazioni i tre si chiamano
**«Listini aggiuntivi»**; in anagrafica «Listini» ne indica cinque. La stessa parola vale per
due insiemi diversi a due schermate di distanza — che è il difetto vero, non la preferenza di
gusto.

**Proposta:** la sezione si intitola **«Prezzi»**, e i tre restano raggruppati dentro come
**«Listini aggiuntivi»** — lo stesso nome che hanno già in Impostazioni. Le due schermate
tornano a dire la stessa cosa con la stessa parola.

_Costo:_ due etichette e i test che le nominano. Nessuna colonna, nessuna migration.

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

---

## Corrispettivo manuale — due difetti trovati usandolo (17/08/2026)

Trovati dal proprietario del progetto sulla maschera appena consegnata, **non da un
test**: è il tipo di difetto che nessuna prova verde intercetta.

> ### ✅ Stato al 18/08/2026: 1, 2 e 3 sono chiusi. Resta aperto solo il 4.
>
> Verificato nel codice, non dedotto da questo file — che era rimasto indietro e li
> dava tutti e tre per aperti. **È il difetto di questo documento, non del codice**, ed
> è esattamente il modo in cui si fa ricominciare qualcuno da un lavoro già fatto.
>
> | #   | Dove si vede che è chiuso                                                                                                             |
> | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
> | 1   | `manual-receipt-form.component.html`: un `app-inline-banner` legato al rifiuto, col commento «Il rifiuto del salvataggio si VEDE»     |
> | 2   | `_document-form.scss` → `td.doc-form__col--tax .doc-select-cell`: fondo `--color-input-bg` e bordo dentro la cella del gruppo calcoli |
> | 3   | `api/src/corrispettivi/corrispettivi.service.spec.ts` → «un pageSize piccolo non taglia più niente»                                   |
>
> E la **guardia** che il §1 chiedeva è stata capita alla radice invece che rattoppata:
> `check-form-errors.mjs` porta ora due commenti che citano proprio questa maschera —
> «aveva un banner che parlava d'altro».
>
> Il testo originale resta qui sotto: dice **come** i tre difetti erano stati misurati,
> e quel metodo serve ancora.

### 1. ✅ CHIUSO — Il salvataggio rifiutato era MUTO

```ts
178:  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
```

`_submitState` è **privato e non arriva al template**. `save()` calcola diligentemente i
suoi messaggi — «Aggiungi almeno una riga con descrizione e importo», «Riga N: scegli il
Codice IVA della riga» — li scrive lì dentro, e **nessuno li legge**: l'unico
`app-inline-banner` della maschera è agganciato a `loadError()`, cioè agli errori di
_caricamento_.

Quindi **ogni** rifiuto del salvataggio è silenzioso, compresi gli errori dell'API. Il
pulsante sembra rotto.

Il percorso misurato: lettere digitate nel campo importo → `parseMoneyInput` rende `null`
→ il netto canonico resta `null` → `buildLinesBody` scarta la riga come vuota →
`lines.length === 0` → messaggio corretto, scritto in un signal che non arriva a schermo.

**La correzione**: esporre lo stato, legarlo al banner, e un test che provi che un rifiuto
**si vede**. Il campo importo resta `type="text" inputmode="decimal"` — con i separatori
decimali italiani `type="number"` non va — ma senza errore visibile l'operatore non ha modo
di sapere che «abc» non è un importo.

⚠️ **E poi la guardia.** `check:form-errors` dice «22 form rifiutano l'invio, e tutti dicono
perché»: questa maschera evidentemente non rientra nel suo censimento. Una guardia che non
copre l'ultimo form aggiunto non proteggerà nemmeno il prossimo — va capito **perché** l'ha
saltata, non aggiunto un caso a mano.

### 2. ✅ CHIUSO — Il Codice IVA di riga non sembrava editabile

Nella tabella righe la cella IVA ha lo stesso fondo grigio delle celle calcolate, mentre è
un valore **che si sceglie**. Va vestita come un campo: **fondo bianco**, come gli altri
controlli editabili della riga.

È la stessa distinzione che il resto della maschera già fa — importo si digita, imponibile e
imposta si leggono — e qui non la fa: la freccina del menu è l'unico indizio, e non basta.

### 3. ✅ PRESIDIATO — `page` e `pageSize` accettati e ignorati

Tolto il limite delle cento righe, `listOrders` restituisce l'insieme intero e i due
parametri **non decidono più niente**. Restano nel contratto perché `Paginated` è una forma
condivisa con mezzo backend, e rifattorizzarla per una schermata sarebbe sproporzionato.

⚠️ **Ma un parametro accettato e ignorato è esattamente il difetto di `onlineOnly`**, che
questa stessa area ha già pagato: qualcuno lo manda, l'API lo prende, non succede niente, e
nessuno se ne accorge finché non conta. Qui il presidio è un test — con `pageSize: 10` le
righe restituite restano 150 — non un commento.

Da riprendere quando si toccherà `Paginated` per altre ragioni, **non prima**: aprire quel
refactor adesso significherebbe muovere un tipo condiviso per un problema che oggi un test
tiene fermo.

### 4. Il Codice IVA si comporta in due modi diversi — e non è un duplicato

Osservato in anagrafica prodotto il 17/08/2026: il campo Codice IVA della scheda **non si
usa da tastiera** come quello delle righe documento.

Non è codice copiato. Sono **due componenti con due modelli di interazione**:

| Dove                | Componente                      | Cos'è, tecnicamente        | Tastiera                                                                                  |
| ------------------- | ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| righe documento     | `app-document-line-select-cell` | un `<input>` vero          | si digita e filtra, Invio sceglie e resta, **Tab risolve e va al campo dopo**, ←/→ escono |
| anagrafica, testate | `app-select-menu`               | un `<button>` con pannello | si apre, si cerca dentro il pannello, Escape chiude                                       |

⚠️ **La divergenza è dichiarata, non accidentale.** `regole-stile-ui` §5 dice che la cella di
riga «sostituisce `app-select-menu` dentro le righe, **e solo lì** — le altre 179 istanze del
menu restano dove sono», perché nata per un problema delle righe: il giro del fuoco fra le
colonne, che in una tabella è il gesto principale.

**Il difetto vero non è la duplicazione: è che all'operatore i due campi sembrano lo stesso
campo.** Stesso dato, stesso aspetto, e il dito sul Tab ottiene due cose diverse a seconda
della schermata.

Tre strade, e nessuna è gratis:

1. **Portare la cella di riga fuori dalle righe** — contraddice la regola citata, che è stata
   scritta con una ragione: fuori da una tabella il Tab non ha un «campo dopo» nella stessa
   colonna, e metà del contratto della cella non ha senso.
2. **Dare a `select-menu` la parte di tastiera che manca** (digita-e-filtra sul trigger, Tab che
   risolve). È la strada più coerente, e tocca **179 istanze**: va misurata prima, non decisa qui.
3. **Accettare la differenza** e dichiararla, se si conclude che una scheda e una riga sono
   contesti diversi anche per il dito.

Da decidere quando si riprenderà l'anagrafica, **non di straforo dentro un lavoro sui
Corrispettivi**: qualunque delle tre tocca componenti condivisi da mezza applicazione.

### 5. Restyle mobile del Registro — FATTO il 18/08/2026

Sessione di rifinitura visiva guidata dagli screenshot, tutta sul Registro
Corrispettivi. **I pattern che ne sono usciti sono scritti in
`regole-stile-ui.md`** e valgono per le altre schermate che verranno riviste:
non vanno riscoperti leggendo questo codice.

| Area           | Prima                                   | Dopo                                                           |
| -------------- | --------------------------------------- | -------------------------------------------------------------- |
| Testata mobile | 5 fasce di comandi prima del primo dato | 2 — «Nuovo» accanto al titolo, poi Esporta · Filtri · Colonne  |
| Filtri mobile  | 6 chip a 44px                           | 1 pulsante «Filtri (n)» + pannello (mixin condiviso)           |
| Export mobile  | 4 pulsanti                              | menu «Esporta» (`app-action-menu` con `triggerLabel`)          |
| Righe mobile   | ripiego `data-label`, 8 righe per card  | card progettata a 3 fasce, accento laterale per tipo           |
| Elenco lungo   | tutto, il riepilogo irraggiungibile     | 25 righe + «Mostra le altre N righe», solo su schermo compatto |
| Riepilogo      | banda piatta, 3 blocchi responsive      | riquadro unico con fili, 2 fasce, **zero** media query         |
| Scroll mobile  | elenco in una finestrella di ~330px     | scorre la pagina, il riepilogo è la coda                       |

**Componenti condivisi estesi** (sempre con `input()` o custom property, mai
`::ng-deep`): `app-button` (`ariaLabel`), `app-action-menu` (`triggerLabel`,
`triggerIcon`, punti di regolazione), più l'estrazione del mixin
`list-page-mobile-filters` da `list-page`, che ora serve anche a chi ha un
layout proprio.

**Token nuovi**: `--border-width-accent` (l'accento laterale, prima scritto
come `--space-1` — un token di spaziatura prestato a un bordo) e
`--summary-item-min-w` (misurato sull'etichetta più lunga della banda totali).

⚠️ **Quello che resta da verificare**: tutto è stato provato ridimensionando la
finestra su PC, **mai su un telefono vero**. La larghezza e le media query sono
fedeli; il tocco no. Da controllare su dispositivo: bersagli da 44px raggiungibili
col pollice, pannello filtri, menu Esporta, e lo scorrimento dell'elenco lungo.

### 6. Pulsante di collasso sidebar a icone — confermato, non ancora costruito

⚠️ **Fuori tema** (shell applicativa, non Corrispettivi): segnato qui solo perché è emerso
durante il restyle di questo Registro (larghezza sidebar, densità filtri), ed è questo il
file da cui si riprende quella sessione.

Deciso il 18/08/2026: dopo aver ridotto `--sidebar-width` da 232px a 196px per prova visiva
passo per passo, resta l'idea di un pulsante che colassi la sidebar a sola icona sulle
finestre strette — confermata dal proprietario del progetto («tasto per ridurla mi piace
l'idea»), mai costruita.

Misurato, per chi riprende:

- Pattern di riferimento: `core/services/theme.service.ts` — `providedIn: 'root'`, `signal` +
  `localStorage` con fallback try/catch. Lo stesso schema serve per lo stato
  collassato/espanso.
- Wiring: `ShellLayoutComponent` (smart, tiene lo stato) → `AppSidebarComponent` (resta dumb:
  riceve via `input()`, emette il toggle via `output()`).
- Il toggle va nella riga del brand (`.app-sidebar__brand`), e solo da `lg` in su: sotto quella
  soglia la sidebar è già un cassetto mobile, il collasso a icone è un problema di larghezza
  _desktop_, non di quello.
- Il token della larghezza collassata **esiste già e non è mai usato**:
  `--sidebar-width-collapsed: 3.5rem` in `_design-tokens.scss` — verificato via grep, nessun
  selettore lo referenzia.
- In collassato, `.app-sidebar__label` / `.app-sidebar__section-title` / `.app-sidebar__brand-copy`
  si nascondono VISIVAMENTE (stile `.sr-only`: clip, non `display:none`), non si tolgono dal DOM
  — il nome della voce deve restare annunciato dallo screen reader anche a sidebar collassata.

Pattern nuovi da riusare, documentati in `regole-stile-ui.md` §5 durante lo stesso lavoro
(barre filtri dense, modalità `select-menu`, variante `flat` di `segmented`, riepilogo di fondo
pagina, riga di subtotale in tabella): utili anche per gli altri riepiloghi/elenchi da
sistemare dopo, non solo per la sidebar.
