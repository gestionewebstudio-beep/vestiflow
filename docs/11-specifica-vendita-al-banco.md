# 11 · Specifica Vendita al banco

**Stato:** specifica funzionale corrente · **16/08/2026**
**Prevalenza:** le decisioni più recenti confermate dall'owner prevalgono su codice, test, audit
e documenti storici incompatibili.

> **Nota di verifica.** Il testo è stato **controllato contro il codice e i dati** prima di
> entrare in `docs/`. Le sezioni marcate ✅ sono state misurate e confermate; quelle marcate ⚠️
> contengono una correzione rispetto alla stesura originale; §20 raccoglie le **due decisioni
> aperte** che il documento non prende.

---

## 0. Scopo

Definisce il significato funzionale della **Vendita al banco** e il suo rapporto con magazzino,
movimenti, Corrispettivi, report del venduto, Shopify POS, registratore telematico ed eventuali
sviluppi futuri.

Serve a tenere separati tre concetti che nel progetto si erano già confusi:

> **vendita gestionale**, **registrazione economica nei Corrispettivi** e **certificazione
> fiscale tramite registratore telematico** sono cose distinte.

Il riferimento osservato è Danea Easyfatt, ma VestiFlow **non ne copia workflow, stati o modello
contabile** solo perché ci sono.

---

## 1. Nome della funzione — ✅ **deciso e applicato il 16/08**

La denominazione esposta all’operatore è **«Vendita al banco»**, più precisa di «Vendita
negozio» perché descrive il caso d’uso: la registrazione gestionale di **una singola vendita
fisica al banco**.

Il tipo tecnico resta **`store_sale`**. Nessuna migration, nessuna rinomina di enum, rotte,
tabelle o valori DB per adeguare un’etichetta.

**Applicata dove indica davvero il documento `store_sale`:** etichette dei tipi documento e
del reso, voce di hub, voce di sidebar, briciola, etichetta dell’origine movimento, i due
messaggi d’errore che la nominano, e le **causali dei movimenti nuovi**.

⚠️ **Non** è stata toccata la parola «negozio» dove indica altro: ambito fisico, sede,
vendite fisiche in generale.

⚠️ **Le causali già scritte restano come sono** — `Vendita negozio VN-2026-0001` —, e nessun
backfill le riscrive. Nello storico movimenti convivranno le due diciture: è il prezzo di non
toccare un registro che l’operatore ha già letto, e va saputo invece che scoperto.

---

## 2. Cos'è

La **rappresentazione gestionale della singola vendita fisica** conosciuta da VestiFlow.

```text
Cliente al banco → scansione/ricerca articoli → quantità e prezzi
→ eventuale cliente → pagamento → conclusione
```

Alla conclusione VestiFlow sa che: la vendita è avvenuta, gli articoli sono usciti, esiste un
effetto economico, la vendita è analizzabile nel venduto e compare nei Corrispettivi interni
con la classificazione corretta.

**Non è un registratore telematico**, e la sua esistenza non prova che sia stato emesso un
documento commerciale.

---

## 3. Cosa NON è

**3.1 Registratore telematico.** VestiFlow deve funzionare anche con cassa non collegabile,
separata dal PC, o battuta a mano dopo.

**3.2 Il Corrispettivo non causa lo scarico.** Lo scarico nasce dalla Vendita al banco. Il
Corrispettivo non deve generare un secondo movimento.

**3.3 Shopify POS** è un'altra sorgente di vendita fisica. Non si fondono solo perché
condividono l'ambito.

**3.4 Documento commerciale emesso.** La presenza in VestiFlow non equivale a «il documento
commerciale è stato emesso». È un piano separato.

---

## 4. Magazzino — ✅ **già conforme, misurato**

**4.1** La scansione **non** crea movimenti: il movimento nasce alla conclusione.

**4.2 Un movimento per riga**, con collegamento stabile a documento e riga.

✅ _Verificato in `store-sales.service.ts`:_ un movimento `sale` per riga, `origin`
`vestiflow_pos`, `sourceDocumentType: store_sale`, `sourceDocumentId`, **`sourceLineId`**, e il
vincolo `UNIQUE (sourceDocumentType, sourceLineId)` che impedisce i doppi. Costo congelato sul
movimento. **Il retry non duplica** per costruzione.

Regole confermate: tenant e location obbligatori; insufficienza stock = **warning non
bloccante**; Giacenza e Disponibile **possono diventare negative**.

✅ _Verificato:_ il codice lo dice per iscritto — «Nessuna guardia: la vendita si registra anche
oltre la disponibile».

**4.3 Corrispettivi e report non movimentano stock.** L'inclusione è un effetto
economico/analitico, mai fisico.

---

## 5. Rapporto con il Registro Corrispettivi — ✅ **implementato il 16/08**

**5.1** Una Vendita al banco conclusa **esiste economicamente** per VestiFlow e compare nel
Registro:

```text
Origine: Vendita al banco · Ambito: Fisico/POS · Canale: VestiFlow
```

### Come, e perché così

**La sorgente canonica resta `Document.type = store_sale`. Il Registro la LEGGE.**

Non si crea un `SalesOrder` per farla entrare: sarebbe una **seconda rappresentazione
persistita** della stessa transazione, cioè esattamente ciò che il §2 della `10` vieta.

Il Registro aveva già una giuntura fatta apposta — `buildRegisterRows` **fondeva due sorgenti
in memoria** (vendite e rettifiche) ordinandole per data, con un tetto dichiarato oltre il
quale chiede di restringere il periodo. La Vendita al banco è la **terza** sorgente e passa di
lì: nessuna UNION scritta a mano, nessuna tabella nuova, nessuna vista.

Conseguenze registrate nel tipo di riga:

- `salesOrderId` è **nullable** e `documentId` è nuovo: una riga del registro può venire da un
  ordine **o** da un documento;
- `financialStatus` è `null` sulla Vendita al banco: si incassa al banco, non ha un ciclo di
  pagamento, e inventarne uno direbbe una cosa non vera;
- la data del registro è **`documentDate`**, non `createdAt`: una vendita registrata il giorno
  dopo resta del giorno prima;
- i documenti **annullati** restano fuori.

**Il riepilogo legge le stesse tre sorgenti dell’elenco.** Se ne leggesse due, la somma della
colonna non farebbe il totale in fondo — il difetto che questa schermata ha già avuto una
volta con le rettifiche.

**5.2 Vendita senza RT collegato.** Vendita da 19,99 € + battitura manuale sulla cassa → nel
Registro **una sola vendita da 19,99 €**.

**5.3 Vendita non certificata.** La vendita gestionale **non sparisce**: il prodotto è uscito,
il magazzino è sceso, il ricavo esiste. La presenza nel Registro **non certifica** l’emissione.

Nessuno stato tipo `scontrinato`, `fiscal_status`, `excluded_pos_register`.

## 6. Registratore telematico

**6.1** VestiFlow deve essere usabile con **cassa esterna non integrata**:

```text
Vendita al banco → conclusione → scarico → Corrispettivo interno
→ eventuale battitura manuale sulla cassa
```

**6.2** Una futura azione **«Emetti documento commerciale»** verso un RT supportato **non è
parte di questa specifica**, non va simulata, non deve essere necessaria, e non cambia
retroattivamente il significato gestionale della vendita.

---

## 7. Chiusura giornaliera

Non si assume che la somma delle Vendite al banco **sia** il totale fiscale del registratore:

```text
Vendite registrate in VestiFlow ....... 50 €
Battute solo sul RT ................... 15 €
VestiFlow conosce 50 · il RT può conoscere 65
```

VestiFlow mostra correttamente i 50 che conosce, **non dichiara** che siano la chiusura fiscale
completa, e **non inventa** i 15 che non conosce. Questo non impedisce alla vendita di entrare
nei Corrispettivi interni.

---

## 8. Report del venduto — ⚠️ **già incluso, correzione**

> **Il Registro conserva il fatto economico; i report e i filtri determinano il perimetro.**

⚠️ **La stesura lasciava intendere che la Vendita al banco potesse essere fuori dal venduto.
Non lo è: c'è già.**

_Misurato:_ il **venduto è costruito sui MOVIMENTI**, non sugli ordini. Un movimento `sale` con
`sourceDocumentType: store_sale` porta il ricavo della propria `DocumentLine`
(`movement-sales-revenue.util.ts`). La Vendita al banco entra quindi nei report **da sempre**.

**È la scoperta che ridimensiona il lavoro, e va detta chiaro:** VestiFlow ha **due motori di
aggregazione**, e solo uno dei due manca.

| Motore                     | Costruito su                           | Vendita al banco  |
| -------------------------- | -------------------------------------- | ----------------- |
| **Report del venduto**     | `stock_movements`                      | ✅ **già dentro** |
| **Registro Corrispettivi** | `sales_orders` + `sales_order_refunds` | ⛔ **fuori**      |

**8.2 Nessun flag persistente «escluso dai report».** Le dimensioni sono canoniche: **Ambito**
(Tutti · Online · Fisico/POS), **Canale** (Tutti · Shopify · VestiFlow · altri realmente
presenti), **Tipo evento** (Vendita · Reso · Rimborso/rettifica), **Fatturazione** (quando ci
sarà una relazione documentale vera).

**8.3 Esempi**

```text
Fisico/POS + VestiFlow  → Vendite al banco
Fisico/POS + Shopify    → Shopify POS
Online     + Shopify    → Shopify ecommerce
Tutti                   → quadro complessivo
```

L'operatore esclude le Vendite al banco da un report **con un filtro**, non cancellandole dal
venduto o dal Registro.

---

## 9. Shopify POS — ✅ verificato

**9.1** Resta una vendita fisica **visibile**: `Ambito: Fisico/POS · Canale: Shopify`. Non si
esclude con vecchi stati fiscali (`10` §4).

**9.2 Duplicazione: non c'è.** ✅ _Verificato:_ la sync Shopify crea un `SalesOrder`; una
Vendita al banco nasce **solo** da `POST /store-sales`; un ordine POS importato **non** crea
anche una Vendita al banco. **Una transazione, una rappresentazione.**

Se un giorno i due flussi si collegheranno, idempotenza e identità della vendita vanno
progettate esplicitamente.

---

## 10. Corrispettivi: classificazione, non workflow

Non si reintroduce l'architettura eliminata: nessuno stato «da inviare / inviato / consegnato /
registrato esternamente». Stampa, CSV ed export sono **manuali, ripetibili, senza effetti**
(`10` §5). La guardia `scripts/check-registro-legacy.mjs` lo fa rispettare.

---

## 11. Rapporto con le Fatture

> Una vendita fatturata non deve produrre doppio conteggio nel riepilogo, **ma deve restare
> consultabile**.

Solo tramite una **relazione documentale strutturata e realmente esistente**. Mai testo delle
righe, descrizioni, vecchi `fiscal_status`, flag legacy o euristiche.

✅ _Verificato: oggi quella relazione **non esiste** per la Vendita al banco._ `InvoiceSalesDdtLink`
lega Fattura ↔ DDT vendita, nient'altro. **Non si inventa qui:** la decisione va nel blocco
Famiglia Fattura.

Che Danea generi una Fattura da una Vendita al banco **non rende la funzione approvata**.

---

## 12. Pagamento e Tesoreria

**Metodo di pagamento ≠ movimento finanziario reale ≠ risorsa finanziaria.**

Non si duplica qui il futuro motore Pagamenti/Tesoreria: si preservano i dati della vendita e
l'eventuale pagamento già previsto. Cassa come risorsa, incassi, saldo, giroconti e allocazioni
appartengono a quel modulo e ne riuseranno il motore comune.

---

## 13. Fotografia del codice — ✅ misurata il 16/08

Non sostituisce la regola funzionale; dice **da dove si parte**.

- tipo tecnico corrente: `store_sale`; il reso è `store_return`;
- nasce da `POST /store-sales`, **non** dalla sync Shopify POS;
- Shopify POS genera un `SalesOrder`, non uno `store_sale`;
- movimenti: uno per riga, `origin` `vestiflow_pos`, con `sourceLineId` e vincolo unico;
- il Registro Corrispettivi è derivato da sorgenti vive; **non** si ricostruisce sulla
  `CorrispettivoEntry` storica (`10` §7);
- `sales_orders.fiscal_status` è stato **rimosso**, colonna e tipo: non si ricrea;
- il workflow «commercialista» è stato ritirato.

_Dati al 16/08:_ **1** vendita al banco, **0** resi, **1** movimento con riga collegata. I 16
movimenti `vestiflow_pos` **senza documento** sono storici, di un percorso precedente.

⚠️ Prima di toccare `store_sale`, **rimisurare i consumer**: il codice può essere andato avanti
rispetto a questa fotografia.

---

## 14. Requisiti per l'inclusione nei Corrispettivi

1. una Vendita al banco conclusa compare **una sola volta**;
2. `Ambito = Fisico/POS`;
3. `Canale = VestiFlow`;
4. conserva la propria **data economica**;
5. imponibile, IVA e totale coerenti col documento sorgente;
6. tenant rispettato;
7. location rispettata;
8. **nessun secondo movimento** di magazzino;
9. nessuna duplicazione con Shopify POS;
10. nessun `fiscal_status`;
11. **nessuna scrittura** nella struttura storica `CorrispettivoEntry`;
12. export e stampa non modificano la vendita;
13. gli stessi filtri danno risultati coerenti fra **elenco, riepilogo, export e stampa**.

---

## 15. Test di accettazione minimi

**15.1 Vendita** — 1 articolo, q.tà 1, 19,99 €, Location A → documento una volta, riga una
volta, **un solo** movimento, Giacenza −1, **nessun** movimento dal Registro, **una sola** voce
economica, `Fisico/POS · VestiFlow`, imponibile/IVA/totale riconciliati.

**15.2 Retry** — ripetendo l'azione finale: nessuna seconda vendita, nessun secondo movimento,
nessun secondo Corrispettivo.

**15.3 Stock insufficiente** — warning non bloccante, vendita conclusa, movimento registrato,
Giacenza/Disponibile possono andare in negativo. ✅ _già conforme._

**15.4 Filtri** — con Vendita al banco + Shopify POS + Shopify ecommerce, le quattro
combinazioni di §8.3 danno ciascuna vendita **una volta sola**.

**15.5 Export** — righe = attese, somme = riepilogo UI, nessuna modifica dopo l'export, nessuna
colonna legacy.

**15.6 Tenant/location** — una vendita del tenant A non compare in B e non altera le quantità
della location B.

---

## 16. Rischi di regressione

Doppio scarico fra Vendita al banco e Corrispettivo · doppia rappresentazione economica ·
reintroduzione indiretta di `SalesOrderFiscalStatus` · uso di `CorrispettivoEntry` come nuova
sorgente · **confusione fra Ambito e Canale** · contaminazione Shopify su tenant senza il modulo
· aggregazioni che sommano due volte · report che **escludono in assoluto** invece di filtrare ·
dedurre la certificazione fiscale dall'esistenza della vendita · dipendenze dal RT che rendano
il modulo inutilizzabile senza.

---

## 17. Fuori perimetro

Collegamento reale con RT · emissione del documento commerciale · lettura della chiusura
giornaliera · riconciliazione VestiFlow ↔ RT · stato «scontrinato» · gestione fiscale completa
della cassa · registrazione manuale della chiusura · nuova struttura `fiscal_status` ·
Fatturazione elettronica · motore Pagamenti/Tesoreria · trasformazione Vendita al banco →
Fattura · workflow copiati da Danea solo perché esistono lì.

---

## 18. Regola sintetica

> **Vendita al banco = singola vendita fisica gestionale conosciuta da VestiFlow.**
>
> Alla conclusione produce lo scarico e il relativo effetto economico, **senza duplicazioni**.
>
> Compare nel Registro Corrispettivi come `Fisico/POS · VestiFlow` **anche quando il
> registratore non è collegato**.
>
> La presenza nel Registro **non certifica** l'emissione del documento commerciale.
>
> Corrispettivi e report **non movimentano** il magazzino.
>
> Il dato generale resta completo; i sottoinsiemi si ottengono **con i filtri**, non con stati
> fiscali o esclusioni persistenti.
>
> Registratore telematico, certificazione fiscale e riconciliazione sono **domini separati**.

---

## 19. Come si esegue

1. ispezionare prima UI, API, DB, movimenti, Corrispettivi, report e test;
2. distinguere **regola richiesta**, **comportamento osservato**, **causa radice** e **modifica**;
3. non assumere che `store_sale` sia corretto solo perché esiste;
4. nessun nuovo stato o workflow senza decisione funzionale;
5. procedere fino a implementazione e test quando le regole bastano;
6. fermarsi solo su una **nuova decisione funzionale reale** o una modifica DB rischiosa;
7. verificare regressioni su tenant, location, quantità, movimenti, Corrispettivi e gating
   Shopify;
8. test backend e frontend, lint, type-check e **compilazione Angular reale**;
9. nessun push, merge o deploy senza decisione esplicita.

---

## 20. ⏸️ Le due decisioni che questa specifica NON prende

### 20.1 Con quale meccanismo la Vendita al banco entra nel Registro

La specifica decide **il risultato** (§5.1) ma non **come**. E il come non è un dettaglio,
perché il Registro e la Vendita al banco vivono su due tabelle diverse: `SalesOrder` contro
`Document`.

| Strada                                                                      | Costo                                                                | Rischio                                                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **A · la Vendita al banco crea anche un `SalesOrder`** con `source = store` | piccolo: il valore `store` esiste già                                | ⛔ crea una **seconda rappresentazione** della stessa transazione dentro VestiFlow — proprio ciò che §2 vieta |
| **B · il Registro diventa l'unione** di ordini e documenti `store_sale`     | grande: elenco, riepilogo, export, stampa, paginazione, filtri, test | nessuna duplicazione; è la lettura onesta di «registro derivato»                                              |

**B è coerente con la specifica, A la contraddice** — ma A è quello che qualcuno sceglierà se
la domanda non viene posta, perché costa dieci minuti.

⚠️ Con B servono anche le due dimensioni **Ambito** e **Canale**, che oggi **non esistono come
concetti**: c'è un solo filtro che mescola i due (`10` §3), e la Vendita al banco non ha un
`source` perché non è un ordine.

### 20.2 Se rinominare «Vendita negozio» in «Vendita al banco»

**26 punti** di codice non-test su 13 file. Nessuno rischioso di per sé, ma due meritano una
riga:

- la **causale dei movimenti** (`Vendita negozio VN-2026-0001`) finisce **nello storico**: i
  movimenti già scritti resteranno con la dicitura vecchia, e non si riscrivono. Convivranno
  due diciture nello stesso registro;
- il tipo tecnico `store_sale` **non si tocca** (§1), quindi resterà una distanza fra nome
  tecnico e nome esposto — cosa già vera oggi, e accettabile, ma da sapere.

**Non è una decisione tecnica: è come si chiama una cosa davanti all'operatore.**

---

## 21. Ambito e Canale — ✅ implementati come dimensioni derivate

Sono **due assi, non uno**. Fino al 16/08 ce n’era uno solo, `channel`, che li mescolava e non
sapeva rispondere a «tutto Shopify, online e POS insieme» — quella domanda tiene fermo il
canale e **libero** l’ambito.

| Origine (`source`) | Ambito     | Canale    |
| ------------------ | ---------- | --------- |
| `shopify_online`   | Online     | Shopify   |
| `shopify_pos`      | Fisico/POS | Shopify   |
| `store`            | Fisico/POS | VestiFlow |
| `manual`           | Fisico/POS | VestiFlow |

**Nessuna colonna persistente:** entrambe si derivano dall’**origine**, che è un fatto scritto
alla creazione. Due colonne in più sarebbero due dati da tenere allineati a uno che c’è già.

⚠️ **`manual` è il caso che ha obbligato a scegliere, e la specifica non lo nominava.** È un
Ordine cliente digitato a mano, quindi **non online**. Sta con le vendite fisiche perché
**l’asse separa online da non-online**, non «al banco» da «non al banco» — ed è la lettura che
rende l’asse **totale**: senza, «Tutti» non sarebbe «Online + Fisico/POS» e una riga sparirebbe
da entrambi i filtri restando nel totale.

Se un giorno servisse distinguerlo, è **una riga** di `corrispettivi-classification.util.ts` da
cambiare, non la struttura.

### L’intersezione vuota è un risultato, non un errore

`Online + VestiFlow` oggi non esiste. La lista resta **vuota** — `{ in: [] }` — invece di
mostrare tutto: mostrare tutto sarebbe la risposta sbagliata alla domanda giusta. Ha un test
suo, perché è il tipo di caso che si sbaglia scrivendo `if (!sources) return {}`.

### Etichette corrette per strada

«Negozio» indicava lo **Shopify POS** e «Cassa» la Vendita al banco: due nomi che si
scambiavano il posto. Ora ogni origine nomina la sorgente vera — **Shopify online**,
**Shopify POS**, **Vendita al banco**, **Manuale**.

---

## 22. Cosa resta fuori, misurato

- **Il filtro Fatturazione** non c’è: per la Vendita al banco **non esiste** una relazione
  documentale con la Fattura (§11), e non si inventa qui. Blocco Famiglia Fattura.
- **I resi al banco** (`store_return`) **non entrano** ancora nel Registro come rettifiche: la
  specifica §5 parla della vendita, e trattarli richiede di decidere se sono una riga negativa
  a sé — come le rettifiche di canale — o altro. **Oggi nel database non ce n’è nessuno.**
- **Il Report del venduto non è stato toccato**: la Vendita al banco c’era già, perché quel
  motore legge i **movimenti** (§8).
