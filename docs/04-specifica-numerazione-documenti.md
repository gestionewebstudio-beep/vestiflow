# Specifica — Numerazione documenti

**Documento di prodotto.** Owner: Luigi. Le decisioni qui dentro sono definitive salvo revisione esplicita e datata.

Questo documento **supera** `numerazione-documenti-verifica.md` (luglio 2026), che era un testo pre-decisione scritto per farsi analizzare il codice. Non va più usato come riferimento: diversi punti che contiene sono stati ribaltati.

Ultimo aggiornamento: 11 agosto 2026.

---

## §0 — Migrazioni implicate

| Intervento                                                   | Tipo            | Note                                                       |
| ------------------------------------------------------------ | --------------- | ---------------------------------------------------------- |
| Proposta del numero per data                                 | **Nessuna**     | Solo `document-numbering.util.ts`                          |
| Preferenza "non mostrare più" per operatore e tipo documento | **Additiva**    | Nuova tabella o campo su preferenze operatore              |
| Sottotipi fattura (nota di credito, fattura d'acconto)       | **Additiva**    | Aggiunta di valori a enum Postgres `DocumentType` — sicura |
| Rimozione numerazione dal Corrispettivo                      | **Distruttiva** | Vedi §7. Da coordinare con `feature/cassa`                 |
| Rimozione `DocumentSequence`                                 | **Distruttiva** | Il backup va sistemato **prima**. Vedi §8                  |

Regola invariata: mai `prisma migrate dev` o `db push` sul database condiviso. Solo `prisma migrate deploy`.

---

## §1 — Il contatore

_Deciso 3 agosto 2026. Verificato in codice 11 agosto 2026: già implementato._

Il contatore è definito da **tenant + tipo documento + serie**. Ogni contatore ha il proprio progressivo, indipendente da tutti gli altri: "serie 2026 per Ordini cliente" e "serie 2026 per Fatture" sono due contatori distinti e possono arrivare entrambi al 42 senza conflitto.

`DocumentCounter` **non memorizza il progressivo**. Il numero si ricava dai documenti reali (vedi §2).

`locationId` sul contatore determina **solo la disponibilità** della serie nella tendina: non partiziona il progressivo. Un contatore senza location è disponibile ovunque; uno con location è disponibile solo per i documenti di quella sede.

**L'anno non esiste come concetto di sistema.** Non sta nel riferimento e non partiziona il progressivo. Chi vuole il reset annuale crea una serie chiamata "2026".

Riferimento: `PREFISSO[-SERIE]-NNNN`. Il prefisso è proprietà del tipo documento e si configura nelle card per tipo. La serie si configura **solo** nei Numeratori.

Ogni tipo nasce con un contatore «Senza serie», seminato dal sistema e non eliminabile → `OC-0001`.

**Superato:** la location come partizione del progressivo; il progressivo modificabile a mano nelle Impostazioni; l'anno come serie implicita. Tutti e tre erano in `numerazione-documenti-verifica.md`.

---

## §2 — La proposta del numero

_Deciso 11 agosto 2026. Divergente dal codice attuale._

Il numero proposto è **il primo numero libero a partire dall'ultimo documento che precede in data** quello che si sta creando, dentro lo stesso contatore.

Esempio: ultimo preventivo 10. Se ne crea uno datato la settimana prossima col numero 15. Oggi se ne crea un altro: la proposta è **11**, non 16.

Se quel numero risulta già occupato, si prende il successivo libero. Nell'esempio: se l'11 esiste già, propone 12.

**Il codice oggi fa `max+1` sull'intera serie** e nello scenario sopra proporrebbe 16. È la principale divergenza aperta.

Conseguenza operativa: la proposta dipende dalla data, quindi **cambiando la data in testata il numero si ricalcola**. Oggi il campo numero non si muove.

**Superato:** `max+1` come regola di proposta (era in `numerazione-documenti-verifica.md` e nelle decisioni del 3 agosto).

### Cancellazioni e buchi

Il buco lasciato da un documento cancellato resta libero e viene riproposto quando la data lo colloca lì. Chi vuole riempirlo esplicitamente lo scrive a mano, e in quel caso non scatta nessun avviso di conflitto perché nessun documento occupa quel numero — può però scattare il controllo cronologico (§4).

### Numero editabile

Il numero è sempre modificabile a mano. Serve a chi migra da un altro gestionale a metà anno e deve allineare la numerazione.

### Niente duplicati, niente "bis"

_Deciso 11 agosto 2026._

Il vincolo unique sul database resta e i duplicati non sono ammessi.

Danea permette il numero "bis" (15, poi 15 bis) per correggere una doppia fattura senza rinumerare le successive. **Non lo adottiamo.** È un rimedio nato dal cartaceo: con la fattura elettronica la correzione di una fattura sbagliata passa dalla **nota di credito**, che è lo strumento previsto dalla legge e lascia traccia di cos'è successo.

Il numero resta quindi un **intero**, la proposta resta aritmetica, l'ordinamento resta numerico.

Conseguenza accettata: un eventuale import da Danea di fatture col bis non potrà mantenere quei numeri come sono. È un problema di migrazione dati, da affrontare se e quando l'import esisterà.

---

## §3 — Conflitto al salvataggio

_Deciso 8 agosto 2026. Verificato in codice 11 agosto 2026: già implementato._

Il numero mostrato all'apertura è una **proposta, non una prenotazione**. Due operatori che aprono un documento nello stesso momento vedono lo stesso numero. Il conflitto si risolve al salvataggio.

Se al salvataggio il numero risulta occupato, compare un **avviso informativo a bottone singolo**: comunica che il numero non è più disponibile e che è stato aggiornato al prossimo libero. OK chiude, il campo Numero si aggiorna, il controllo torna all'operatore.

**Il documento non si salva da solo.** Se l'operatore ripreme Salva e nel frattempo anche quel numero è stato preso, riappare lo stesso avviso col numero ulteriormente aggiornato.

Esc e OK fanno la stessa cosa.

**Superato:** il modale a due bottoni "Usa Y / Annulla" (24 luglio); il modale a tre opzioni con "Salva con numero duplicato" e l'evidenziazione arancione dei duplicati in lista (`numerazione-documenti-verifica.md`).

Implementazione: `document-number-conflict.store.ts`, dialog con `confirmLabel="OK"` e `[acknowledge]="true"`.

---

## §4 — Controllo cronologico

_Deciso 11 agosto 2026. Da implementare._

**Il fatto controllato:** dentro lo stesso contatore, a numero più alto deve corrispondere data uguale o successiva.

**Stessa data, nessuna anomalia mai.** Nella giornata l'ordine dei numeri non significa niente: creare, saltare, tornare indietro a tappare un buco è tutto libero.

L'anomalia può nascere solo in due modi, perché la proposta automatica è corretta per costruzione:

- l'operatore scrive il numero a mano
- l'operatore cambia la data di un documento già salvato

**Comportamento:** avviso, non blocco. L'avviso **elenca i documenti in anomalia**, non solo quello corrente. Sì salva comunque, No torna al documento.

L'avviso è **persistente**: continua a comparire finché l'anomalia resta nei dati, anche sui documenti successivi corretti. È voluto — un buco non giustificato su un registro va risolto, e un avviso che sparisce da solo lascia dimenticare.

**Casella "non mostrare più questo messaggio":** spegne l'avviso **solo per il tipo documento in cui è comparsa**. Chi sistema le fatture non resta cieco sui DDT.

Una volta spenta resta spenta. Nessuna riaccensione, nessun pannello nelle Impostazioni.

La preferenza è **per operatore e per tipo documento**.

**Si applica a tutti i tipi documento**, non solo ai fiscali. Non decidiamo noi a monte dove serve: lo decide l'operatore spegnendolo dove non gli interessa.

---

## §5 — Serie e testata

_Deciso 3 agosto 2026, verificato 11 agosto 2026._

Testata: **Data, Serie, Numero**.

La serie si sceglie da una tendina, non si scrive. La tendina contiene i contatori del tipo documento corrente, filtrati sulla sede selezionata: quelli con quella sede più quelli senza.

Default: il contatore marcato `isDefault`.

**Superato:** "ultima serie usata dall'operatore" come default (`numerazione-documenti-verifica.md` e prompt del 24 luglio). Vince `isDefault`, che è configurato e non segue l'operatore.

Al cambio di serie il numero si ricalcola sul contatore della nuova serie.

Icona ⚙ accanto al campo Serie: apre il popup dei numeratori filtrato, riusando il componente delle Impostazioni. Il popup aggiorna la tendina **senza auto-selezionare**.

Su un documento già salvato tutta la testata resta modificabile: data, serie e numero. Anche verso una serie che non è più quella corrente.

**Da verificare:** `DocumentTypeSetting` porta ancora `autoNumbering` e `defaultSeries` (default `'A'`). La logica di numerazione non li consulta, ma restano trasportati da impostazioni e DTO. Il 3 agosto era stato deciso di rimuoverli proprio perché creavano una seconda configurazione della serie che non si parlava con i contatori. Da tracciare fino al frontend prima di toglierli.

---

## §6 — Categorie di documento

_Impianto 24 luglio 2026, etichetta rivista 11 agosto 2026._

### Categoria A — un solo blocco identità

Data, Numero, Serie in testata.

Preventivo, Ordine cliente, Fattura proforma, DDT di vendita, Fattura (con la sua famiglia di sottotipi), Ordine fornitore, Scarico manuale, Trasferimenti.

### Categoria B — due blocchi distinti

Documenti che arrivano dal fornitore: il numero contabile è quello del fornitore, il nostro serve solo a catalogare.

Arrivo merce, Registrazione fattura fornitore.

- Blocco _Documento fornitore_: Fornitore, Tipo doc., Data doc., N. doc.
- Blocco _Registrazione VestiFlow_: Data registrazione, **Numero**, Serie

Sull'Arrivo merce il **Tipo doc.** è un elenco configurabile (DDT, fattura accompagnatoria, altro), perché la merce può arrivare accompagnata da documenti diversi. Sulla Registrazione fattura fornitore non serve: il tipo è già nel nome.

### Il numero interno si chiama "Numero", non "Protocollo"

_Deciso 11 agosto 2026, sulla base di verifica normativa._

L'obbligo di numerazione progressiva delle fatture d'acquisto **non esiste più**: l'art. 13 del D.L. 119/2018 lo ha eliminato dall'art. 25 del DPR 633/1972, per adeguare la norma alla fatturazione elettronica. Le fatture elettroniche si registrano liberamente, senza progressione numerica né ordine di ricezione, con l'unico vincolo di essere annotate prima della liquidazione periodica in cui si detrae l'IVA.

Il numero interno resta utile come collegamento tra registrazione contabile e documento archiviato, ma è una comodità gestionale, non un vincolo di legge. Non c'è quindi ragione di introdurre una seconda parola per la stessa cosa.

La confusione col numero del fornitore si risolve con la separazione visiva dei due blocchi, non con l'etichetta.

**Superato:** "Protocollo" come etichetta del numero interno (24 luglio). La distinzione era motivata da un obbligo normativo che non esiste.

**Superata** anche la Categoria C (Scarico manuale, Trasferimenti, Rettifiche con numero automatico non editabile e senza serie), proposta il 24 luglio e sciolta subito dopo: quei documenti hanno serie e numero editabile come tutti.

---

## §7 — Documenti senza operatore, e i Corrispettivi

_Deciso 11 agosto 2026._

### Ordini dai canali

Gli ordini importati da Shopify e dagli altri canali **portano il numero del canale**. `sales_orders.number` resta NULL per le origini non manuali: il numero del canale è il loro identificativo e serve a riconciliare.

### Corrispettivi: registro, non documento

**Decisione:** Corrispettivi diventa un **registro**, non un tipo documento.

Il ragionamento: VestiFlow conosce già tutte le vendite, riga per riga, con aliquota e totale. Il totale giornaliero per sede, canale e aliquota è quindi una **query su dati che già esistono**. Creare un documento per contenerlo significa duplicare informazione e doverla tenere allineata.

Il corrispettivo come documento nasce in sistemi che i dati di vendita non li hanno — Danea infatti lo fa registrare a mano a fine giornata, e dichiara come motivo il fatto che potrebbero esistere scontrini battuti senza passare dal gestionale.

**Il registro** aggrega le vendite per giorno, sede, canale e aliquota. Nessuna numerazione, nessuna serie, nessun contatore. Filtri per periodo, canale, aliquota, ed esportazione per il commercialista.

Le vendite in negozio ci finiscono dentro automaticamente, senza nessuna azione dell'operatore. Il "registra corrispettivi di fine giornata" di Danea non esiste.

**Superate:** la separazione per serie tra cassa e canali online; l'ipotesi di "precompila e conferma" a fine giornata; l'ipotesi della chiusura di periodo.

### Correzioni

Il corrispettivo non si corregge: si corregge il documento da cui deriva. Il registro si riallinea da sé.

### Base normativa

Il corrispettivo in VestiFlow **non è un documento fiscale**. Dal 1° gennaio 2020 il registro dei corrispettivi ha smesso di essere un obbligo: l'art. 2 comma 1 del D.Lgs. 127/2015 stabilisce che l'invio telematico dal registratore telematico entro 12 giorni sostituisce gli obblighi di registrazione dell'art. 24 del decreto IVA. Solo le categorie esonerate dall'invio telematico usano ancora il registro in alternativa.

L'adempimento fiscale sta nel registratore telematico. Il registro serve a VestiFlow e al commercialista per controlli e quadrature.

Conseguenza: **la numerazione del corrispettivo non ha vincoli di legge**, e questo è ciò che rende possibile la decisione sopra.

### Il vecchio motore

Vendita online e Corrispettivo usano oggi `DocumentSequence`: contatore autonomo, serie `'A'` scritta nel codice, anno dentro la partizione, riferimento `COR-2026-0001`. Vivono in tabelle proprie (`online_sales`, `corrispettivo_entries`) col vincolo `(tenant, serie, anno, numero)`.

È un **secondo motore di numerazione** da eliminare. Con la decisione sopra il lavoro non è più "unificarlo sullo schema nuovo" ma **togliere al corrispettivo la numerazione che ha**.

`feature/cassa` ha già scritto codice sul corrispettivo con una sequenza condivisa fra cassa e online. Quella scelta è **superata da questa decisione** e va comunicata al collega prima che si lavori nella direzione vecchia.

---

## §8 — Residui tecnici

_Verificati da Claude Code l'11 agosto 2026._

**`nextDocumentNumber`** in `document-totals.util.ts:17` non ha chiamanti. Residuo della vecchia implementazione, rimovibile.

**`DocumentSequence`** è agganciata al backup in cinque punti: due elenchi in `tenant-backup.constants.ts` (entità esportate e ordine di import), il ramo di export, e nell'import un `deleteMany` seguito da `createMany`.

Il vincolo vero non è il codice: **i pacchetti di backup già prodotti contengono un `documentSequences.json`**, e il formato è dichiarato alla versione 1. Se si rimuove la tabella, l'import deve continuare a tollerare quel file negli archivi vecchi — altrimenti un ripristino si rompe in silenzio, che è il modo peggiore in cui un backup smette di essere un backup.

**Il backup va sistemato prima della rimozione.**

**Fattura accompagnatoria:** `document-type.util.ts:35` mappa già `invoice_accompanying → invoice_draft` per la numerazione. Fattura e Fattura accompagnatoria **condividono già un solo progressivo**: non ci sono due contatori da fondere. Il lavoro sui sottotipi è quindi di sola presentazione, e additivo.

---

## §9 — Fuori perimetro

Restano da decidere in una sessione dedicata, perché non sono materia di numerazione:

- **Famiglia fattura**: selettore all'apertura, colonna sottotipo nell'elenco, comportamenti per sottotipo. L'autofattura resta esclusa in attesa di chiarimento.
- **Nota di credito**: segno sulla riga, direzione del movimento di magazzino, collegamento alla fattura d'origine. Creazione da zero e generazione da fattura esistente devono produrre lo stesso risultato.
- **Corrispettivo manuale**: forma del documento (righe contabili senza articolo — importo, aliquota, descrizione), e casi d'uso.
- **Resi**: riga negativa nel giorno del reso o rettifica sull'originale.
- **Esclusione automatica** delle vendite fatturate dall'aggregazione, per non contare due volte lo stesso incasso.
- **Trasferimenti interni**: comando "Genera DDT" disponibile sempre, nessun automatismo. Il trasferimento tiene la sua numerazione, il DDT la sua.
- **Tipi mancanti** dalla lista: Rettifiche di giacenza, inventario, reso di negozio.
- **Rinomini**: Proforma → Fattura proforma; Vendita in negozio → Vendita al banco; come qualificare il DDT di vendita senza confonderlo con quello del fornitore.
- **Registratore telematico**: un browser non può parlare con un dispositivo sulla rete locale. Due strade, entrambe da valutare — chiamata diretta al servizio di rete del registratore, o programma ponte installato sul computer del negozio. Va anche scelta la lista dei modelli supportati.

### Domande aperte per il commercialista

1. Procedura corretta per registrare un incasso reale quando il registratore telematico non funziona.
2. Se le sedi secondarie vadano dichiarate all'Agenzia come luoghi di deposito — la merce in un deposito non dichiarato rientra nella presunzione di cessione.

---

## Ordine di esecuzione

1. Proposta del numero per data invece che `max+1` — un solo file
2. Controllo cronologico con avviso persistente
3. Famiglia fattura (sottotipi) — additivo, nessun rischio
4. Rimozione della numerazione dal Corrispettivo — **da coordinare con `feature/cassa`**
5. Rimozione di `DocumentSequence` — **backup sistemato prima**

I punti 1 e 2 non collidono con `bugfix/righe-documento` né con i rami del collega.
