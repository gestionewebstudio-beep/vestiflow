# VestiFlow — Pagamenti, Scadenzario e Tesoreria operativa

## Analisi funzionale e tecnica aggiornata

**Versione:** v3.0  
**Data:** 15 agosto 2026  
**Owner funzionale:** Luigi  
**Stato:** modulo confermato nel target VestiFlow; modello funzionale da consolidare tecnicamente dopo censimento repository/database/ramo cassa  
**Perimetro:** Fatture attive/passive, vendite, scadenze, incassi/pagamenti reali, contrassegno, risorse, allocazioni, giroconti, Note di credito e registro Pagamenti

> **Prevalenza.** Questa versione incorpora le decisioni successive al documento v2.0 del 14/08. Dove incompatibile, la presente v3.0 prevale. Le strutture dati restano da verificare: il target è unificare ciò che già esiste, non creare un secondo motore parallelo.

> **Vincolo operativo.** Nessuna migration, deploy, push, merge o pubblicazione è autorizzata da questo documento. Prima si censisce il repository, il database reale e il ramo `feature/cassa`.

---

## 0. Decisioni consolidate al 15/08

### D-01 — Il modulo si fa

**DECISO.** Pagamenti / Scadenzario / Tesoreria operativa entra nel prodotto VestiFlow. Non è più un'ipotesi da rimandare.

### D-02 — Due punti di accesso complementari

**DECISO 15/08.** Il pagamento vive in due luoghi:

1. **scheda `Pagamento` nel singolo documento**, per piano, scadenze, saldi e movimenti collegati;
2. **sezione autonoma `Pagamenti`**, registro trasversale per controllare denaro, scadenze, risorse, allocazioni e operazioni finanziarie.

La scheda guarda un documento; il registro guarda il denaro.

### D-03 — Contrassegno

**DECISO.** Il Contrassegno è un metodo/tipo di pagamento, non un documento. Non crea un Corrispettivo manuale né un incasso bancario al checkout.

### D-04 — Corrispettivi

**DECISO.** I Corrispettivi sono un registro economico interno derivato dalle vendite. Non sono documenti modificabili, non sono scadenzario, non sono prima nota e non sono la sede per registrare manualmente incassi/contrassegni.

### D-05 — Nessuna modifica retroattiva automatica

Pagamenti, movimenti, riferimenti e snapshot finanziari già registrati non cambiano perché cambia l'anagrafica, una risorsa o un default.

---

## 1. Principio architetturale: quattro concetti separati

Il modello di riferimento separa:

1. **condizione / piano di pagamento** — ciò che è previsto;
2. **scadenza / partita** — ciò che resta da regolare;
3. **movimento finanziario reale** — denaro realmente entrato/uscito;
4. **allocazione** — quota di un movimento applicata a una o più partite.

Questo modello è coerente con le analisi del 14/08 e con l'osservazione diretta di Danea del 15/08.

**Principio centrale:** un movimento può regolare N partite e una partita può essere regolata da N movimenti.

La relazione deve essere strutturata con importo, non affidata a note testuali.

### Stato della decisione tecnica

La funzione è nel target; **la forma esatta delle tabelle non è decisa**. Prima va misurato quanto esiste già in `DocumentPaymentInstallment`, `store_sale_payments`, `cash_sessions`, `pos_terminals`, vendite online e ciclo passivo.

---

## 2. Concetti di dominio

| Concetto                 | Significato                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| Metodo/tipo di pagamento | Bonifico, Contanti, Carta, Contrassegno, Ri.Ba., SDD, ecc.          |
| Condizione               | Immediato, 30 gg, 30 gg F.M., 30/60/90, piano personalizzato        |
| Scadenza/partita         | Importo da regolare con origine, soggetto, data e residuo           |
| Movimento finanziario    | Evento reale di entrata/uscita                                      |
| Allocazione              | Quota di un movimento applicata a una partita                       |
| Risorsa finanziaria      | Conto, cassa o wallet realmente movimentabile                       |
| Soggetto commerciale     | Cliente/fornitore dell'operazione                                   |
| Intermediario            | Corriere COD/provider che riscuote o riversa per conto dell'azienda |
| Giroconto                | Spostamento fra risorse proprie, non entrata/uscita economica       |

**Regola:** metodo della vendita e metodo del movimento reale possono differire. Vendita = Contrassegno; riversamento azienda = Bonifico ricevuto dal corriere.

---

## 3. Censimento obbligatorio prima del modello dati

Claude Code deve verificare almeno:

- `DocumentPaymentInstallment`;
- modalità di create/update/delete delle scadenze passive;
- eventuale delete-and-recreate al salvataggio;
- `paymentTerms`;
- `paymentMethod`;
- `paymentDueDate`;
- `iban` e snapshot coordinate;
- `/app/settings/pagamenti`;
- `store_sale_payments`;
- `cash_sessions`;
- `pos_terminals`;
- pagamenti Vendita negozio;
- pagamenti Vendita online;
- Registrazione fattura fornitore;
- tabelle presenti nel DB ma non in Prisma;
- ramo `feature/cassa`.

### Blocker identità scadenze

Se le scadenze vengono cancellate e ricreate a ogni salvataggio, non si possono collegare allocazioni persistenti ai loro ID. Va stabilizzata l'identità o introdotta un'entità finanziaria stabile equivalente.

### Nessun numero di tabelle predefinito

La precedente stima di “~10 tabelle” **non è un requisito**. Il numero va determinato solo dopo il censimento e il riuso delle strutture esistenti.

---

## 4. Scheda `Pagamento` del documento

**DECISO come collocazione funzionale.** Fattura e Fattura accompagnatoria condividono la stessa scheda; il ciclo passivo deve convergere sullo stesso dominio senza regressioni.

La scheda deve poter rappresentare:

- condizione pagamento;
- metodo proposto;
- coordinate/risorsa proposta;
- snapshot delle coordinate sul documento;
- piano scadenze;
- importo regolato;
- residuo;
- eventuale compensazione;
- movimenti collegati;
- dettaglio allocazioni.

### Azioni target

- aggiungi/modifica scadenza;
- rigenera piano dalla condizione;
- registra incasso/pagamento reale;
- registra incasso parziale;
- associa movimento preesistente;
- apri dettaglio allocazioni;
- ripianifica soltanto ciò che non distrugge pagamenti reali.

I default cliente possono precompilare ma restano modificabili.

---

## 5. Scadenze e piano

Il piano è previsione, non denaro.

Esempi:

- €183,03 30 gg → una scadenza €183,03;
- €1.000 30/60 → €500 + €500;
- €100 tre rate → €33,33 + €33,33 + €33,34.

Regole:

- calcoli in minor units/centesimi;
- arrotondamento deterministico;
- somma rate = totale finanziario salvo compensazioni esplicite;
- formule lato dominio/backend;
- frontend può mostrare anteprima ma non è autoritativo;
- identità della scadenza stabile quando esistono allocazioni reali.

### Stato finanziario

`Da saldare`, `Parziale`, `Saldato`, `Scaduto` sono **stati funzionali derivati** da importo, scadenze e allocazioni. Non è deciso che debbano essere memorizzati in un enum persistente; evitare una seconda fonte di verità.

---

## 6. Incasso parziale / acconto operativo

Su una fattura già emessa, `Registra acconto / incasso parziale` significa **denaro realmente ricevuto**.

Non confondere:

- quota futura del piano;
- incasso reale;
- fattura fiscale d'acconto/anticipo, che è un altro problema fuori da questo perimetro.

Esempio:

Fattura €183,03 → incasso reale €30 → residuo €153,03.

Il movimento deve restare persistente anche se successivamente si modifica il piano.

---

## 7. Movimenti finanziari reali

Un movimento reale deve poter contenere almeno, se confermato dal modello tecnico:

- data;
- direzione Entrata/Uscita;
- importo positivo;
- metodo;
- risorsa;
- soggetto;
- eventuale intermediario;
- riferimento TRN/CRO/distinta/provider;
- descrizione/note;
- allegato, se supportato;
- quota non allocata;
- audit utente/data.

Il segno non si inserisce nell'importo UI: lo determina la direzione.

Un movimento può esistere anche prima di essere completamente allocato.

---

## 8. Allocazioni

Target funzionale:

- una partita ← N movimenti;
- un movimento → N partite;
- allocazione con `amountMinor` o equivalente;
- nessuna allocazione cross-tenant;
- retry non duplica;
- importi allocati non superano il disponibile salvo procedura esplicita di credito/eccedenza.

La UI deve mostrare anche il contesto del movimento complessivo, per esempio:

`€38,51 (parte di €80,37)`.

Questo comportamento è stato osservato nel registro Pagamenti Danea ed è utile come requisito UX, non come prova del suo schema interno.

---

## 9. Saldo multiplo

Caso fondante:

Bonifico €1.000:

- Fattura A €300;
- Fattura B €500;
- Fattura C €200.

Deve esistere **un solo movimento reale** e tre allocazioni. Non creare tre bonifici fittizi.

Il registro deve offrire un'azione equivalente a `Saldo multiplo`, con data/metodo/risorsa/riferimento comuni e allocazioni selezionate.

---

## 10. Pagamento superiore / eccedenza

Dovuto €183,03, ricevuto €200:

- partita regolata per €183,03;
- €16,97 restano non allocati/credito secondo la policy approvata;
- il totale della fattura non cambia.

Non forzare la modifica del documento economico per far tornare il pagamento.

---

## 11. Contrassegno e riversamento del corriere

**DECISO il dominio del Contrassegno.** Il flusso reale può essere:

1. cliente paga al corriere;
2. il corriere detiene temporaneamente il denaro;
3. il corriere riversa all'azienda con uno o più bonifici;
4. un singolo bonifico può comprendere più vendite/clienti.

Esempio:

- Vendita 1 COD → quota €38,51;
- Vendita 2 COD → quota €41,86;
- GLS riversa €80,37 con un solo bonifico.

VestiFlow deve poter rappresentare:

- metodo vendita = Contrassegno;
- intermediario = GLS/BRT;
- movimento reale = Bonifico €80,37;
- risorsa = conto aziendale;
- due allocazioni sulle vendite.

Non creare un incasso bancario al checkout Shopify e non usare i Corrispettivi come documento COD.

---

## 12. Registro `Pagamenti`

**DECISO come modulo/vista autonoma.** Registro trasversale a clienti, fornitori e documenti.

Benchmark Danea osservato il 15/08:

- data documento distinta da data pagamento/scadenza;
- soggetto;
- descrizione/origine;
- modalità;
- risorsa;
- Entrate e Uscite separate;
- Saldato;
- documento/riferimento pagamento;
- importo e allocazione “parte di”;
- filtri periodo/stato/risorsa/soggetto;
- `Nuovo pagamento`;
- `Saldo multiplo`;
- `Nuovo giroconto`;
- allegati/export/stampa.

### 12.1 Scadenze nel registro

Le scadenze future o scadute possono comparire come previsioni, ma **non devono entrare nel saldo reale della risorsa** finché non esiste un movimento effettivo.

Va verificato il comportamento Danea osservato su saldo iniziale/finale e righe non saldate; non copiarlo senza misura.

---

## 13. Risorse finanziarie

Concettualmente:

- Cassa;
- conto bancario;
- PayPal/Stripe o wallet equivalenti;
- altre disponibilità realmente movimentabili.

**Metodo ≠ Risorsa.**

Prima di creare `FinancialResource`, verificare `cash_sessions`, `store_sale_payments`, POS e ramo cassa.

Una risorsa disattivata non viene proposta per nuovi movimenti, ma lo storico resta leggibile.

I saldi delle risorse devono derivare dai **movimenti reali**, non dalle scadenze previste.

---

## 14. Giroconto

**Target emerso dal benchmark e incluso nel modulo.** Spostare denaro tra due risorse aziendali non è ricavo/costo e non è un pagamento cliente/fornitore.

Il giroconto deve essere atomico:

- uscita da risorsa A;
- entrata su risorsa B;
- stesso evento logico;
- nessuna duplicazione su retry.

La forma tecnica esatta resta da definire dopo il censimento.

---

## 15. Ciclo passivo

La Registrazione fattura fornitore ha già logiche di scadenza e non va sostituita con un secondo motore.

Claude deve verificare:

- `DocumentPaymentInstallment`;
- FK/cascade;
- create/update/delete;
- stabilità ID;
- UI/API;
- pagamenti fornitore;
- eventuale stato `settled`.

Target: stesso dominio finanziario per attivo e passivo.

- attivo → credito/entrata;
- passivo → debito/uscita.

---

## 16. Nota di credito — confine finanziario

**Principio:** NC ≠ rientro merce ≠ rimborso monetario.

### 16.1 Fattura ancora da regolare + NC

La NC può ridurre la posizione netta da incassare tramite compensazione/applicazione. **Nessun movimento banca/cassa automatico.**

### 16.2 Fattura già regolata + NC

Nasce una posizione/credito a favore del cliente. **Nessuna uscita automatica.**

### 16.3 Rimborso reale

Quando l'azienda restituisce realmente denaro:

- movimento `Uscita`;
- risorsa effettiva;
- allocazione al credito/partita della NC.

La forma tecnica precisa di compensazione/credito va validata nel disegno finale dopo il censimento.

---

## 17. Modifica del documento dopo pagamenti reali

### Documento senza movimenti reali

Il piano può essere rigenerato/ripianificato.

### Documento con movimenti allocati

- non cancellare implicitamente movimenti reali;
- preservare allocazioni valide o guidare la riallocazione;
- nuovo totale > regolato → ripianificare soltanto il residuo;
- nuovo totale < regolato → eccedenza/credito;
- una scadenza saldata non può sparire silenziosamente.

Il sistema deve distinguere chiaramente modifica del documento economico da nuovo evento finanziario.

---

## 18. Shopify e pagamenti

Per vendite Shopify:

- il metodo di pagamento importato è fotografia della transazione;
- COD/manual payment non diventa automaticamente un incasso reale;
- gli importi economici originari non vengono ricalcolati localmente;
- l'eventuale riversamento/provider reale viene registrato come movimento separato quando avviene;
- la gestione Pagamenti non deve modificare il Corrispettivo derivato né riscrivere l'ordine Shopify.

L'onboarding/cutover Shopify resta fuori da questo lavoro.

---

## 19. FatturaPA / `DatiPagamento` — contesto preliminare

Il piano di pagamento strutturato deve essere compatibile con la futura generazione del blocco `DatiPagamento`.

**Separazione fondamentale:**

- FatturaPA descrive il piano/condizioni del documento;
- Tesoreria registra ciò che è realmente avvenuto.

Non serializzare in XML un bonifico avvenuto mesi dopo come se fosse la condizione originaria del documento.

La mappatura esatta dei codici/modalità e dei campi FatturaPA va verificata nel blocco FE dedicato sulle specifiche ufficiali correnti.

---

## 20. API, DB, sicurezza e idempotenza

Requisiti trasversali:

- tenant-scoping su tutte le entità;
- autorizzazioni per lettura/creazione/modifica/storno;
- importi in minor units;
- transazioni atomiche per movimento + allocazioni;
- idempotency key o vincoli univoci nei percorsi ripetibili;
- nessuna modifica manuale di saldo che bypassi i movimenti;
- audit di utente/data;
- conservazione dello storico in caso di disattivazione risorsa/metodo;
- nessuna cancellazione distruttiva di movimenti reali già usati.

---

## 21. Sequenza di implementazione proposta

La sequenza è operativa, non autorizzazione automatica.

### P0 — Censimento

Repository, DB reale, `feature/cassa`, modelli esistenti.

### P1 — Identità stabile delle partite

Eliminare eventuale delete/recreate incompatibile con allocazioni.

### P2 — Fondazioni finanziarie

Movimenti reali, risorse, allocazioni, idempotenza, riuso strutture esistenti.

### P3 — Scheda Pagamento documenti attivi

Scadenze, parziali, movimenti collegati.

### P4 — Convergenza ciclo passivo

Riusare il dominio senza regressioni.

### P5 — Saldo multiplo e COD

Intermediari e riversamenti cross-cliente.

### P6 — Registro Pagamenti

Filtri, saldo reale, allocazioni, giroconti.

### P7 — Nota di credito finanziaria

Compensazioni, credito cliente, rimborso separato.

### P8 — Regressione completa

UI/API/DB/E2E/manuale.

---

## 22. Scenari di accettazione

### PAG-001

€183,03 30gg → 1 scadenza €183,03.

### PAG-002

€1.000 30/60 → €500 + €500.

### PAG-003

€100 / 3 → 33,33 + 33,33 + 33,34.

### PAG-004

Incasso parziale €30 → un movimento, allocazione €30, residuo €153,03.

### PAG-005

Tre incassi sulla stessa partita → tre movimenti, residuo derivato.

### PAG-006

Una fattura, due metodi/risorse → due movimenti, residuo 0.

### PAG-007

Un bonifico salda tre fatture → un movimento, tre allocazioni.

### PAG-008

Pagamento superiore → eccedenza non allocata/credito; fattura invariata.

### PAG-009

Modifica documento senza incassi → piano rigenerabile.

### PAG-010

Modifica documento con incasso → movimento preservato; solo residuo/eccedenza riconciliati.

### PAG-011

Scadenza saldata non eliminabile silenziosamente.

### PAG-012

NC su posizione ancora aperta → compensazione, nessun movimento banca.

### PAG-013

NC su posizione già regolata → credito cliente, nessuna uscita automatica.

### PAG-014

Rimborso NC → movimento reale Uscita + allocazione.

### PAG-015

COD al checkout → nessun incasso bancario inventato.

### PAG-016

Bonifico corriere multi-COD → un movimento, N allocazioni, intermediario comune.

### PAG-017

Corrispettivi → nessuna registrazione manuale del pagamento nel registro economico.

### PAG-018

Ciclo passivo → stesso dominio senza regressioni.

### PAG-019

Riapertura documento → scadenze/allocazioni persistono.

### PAG-020

Retry/doppio click → nessun movimento/allocazione duplicati.

### PAG-021

Cross-tenant → nessuna lettura o allocazione incrociata.

### PAG-022

Risorsa disattivata → non proposta per nuovi movimenti, storico invariato.

### PAG-023

Giroconto → movimento atomico fra due risorse, nessuna entrata/uscita economica doppia.

---

## 23. Checklist di ispezione per Claude Code

Per ogni componente restituire:

- esiste / parziale / mancante / divergente / presente in altro ramo;
- file/funzione/riga;
- tabelle/colonne/vincoli;
- comportamenti UI/API/DB;
- test esistenti;
- causa radice;
- riuso possibile;
- migration necessaria o no;
- rischio regressione;
- decisione funzionale ancora necessaria.

### Domande tecniche obbligatorie

1. `DocumentPaymentInstallment` ha ID stabile?
2. Le scadenze vengono delete/recreate?
3. `store_sale_payments` rappresenta movimento reale, tender o altro?
4. `cash_sessions` può diventare risorsa/movimento o è un dominio diverso?
5. `pos_terminals` è solo terminale o contiene saldo?
6. Come sono registrati oggi i pagamenti Vendita negozio?
7. Come sono registrati/preservati i metodi Vendita online?
8. Esistono tabelle DB finanziarie non modellate in Prisma?
9. Quali permessi esistono già?
10. Come evitare un secondo motore attivo/passivo?

---

## 24. Decisioni ancora da chiudere

Non decidere per interpretazione:

1. schema dati definitivo delle risorse finanziarie;
2. forma tecnica di movimento/allocazione dopo il censimento;
3. policy precisa dell'eccedenza/credito non allocato;
4. modalità di compensazione NC nel modello dati;
5. gestione del saldo iniziale di una risorsa al momento dell'adozione VestiFlow;
6. dettagli UI definitivi del registro Pagamenti;
7. integrazioni avanzate Ri.Ba./SDD/home banking;
8. eventuale uso di intermediari/provider oltre al COD;
9. policy di cancellazione/storno dei movimenti reali;
10. mappatura FatturaPA definitiva dei `DatiPagamento`.

---

## 25. Conclusione operativa

Il modulo Pagamenti non va ridotto a una colonna `pagato` sulla Fattura. Il target è un dominio finanziario operativo in cui piano, scadenza, denaro reale, risorsa e allocazione restano distinti e verificabili.

Il primo passo non è creare nuove tabelle: è misurare ciò che VestiFlow e il ramo cassa hanno già, stabilire cosa si riusa e solo dopo approvare il modello dati e le migration.
