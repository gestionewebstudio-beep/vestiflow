**VESTIFLOW**

**Pagamenti, Scadenzario e Tesoreria operativa**

**Specifica funzionale consolidata e mandato tecnico per Claude Code**

| **Versione**  | 1.1                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Data**      | 21 agosto 2026                                                                                                                                                                                   |
| **Stato**     | Target funzionale consolidato; implementazione solo dopo censimento tecnico                                                                                                                      |
| **Perimetro** | Anagrafica Tipi pagamento condivisa trasversalmente; componente Pagamento completa solo nei documenti espressamente previsti; scadenze, movimenti, risorse, allocazioni, FE e registro centrale. |
| **Principio** | Un solo dominio Pagamenti e una sola anagrafica Tipi pagamento. Non tutti i documenti montano la componente finanziaria completa.                                                                |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>ISTRUZIONE PRINCIPALE A CLAUDE CODE</strong></p>
<p>Questa specifica definisce il comportamento corretto da raggiungere. Prima di creare tabelle, migration, servizi, API o componenti, ispezionare repository e database, mappare ciò che esiste, individuare causa radice e duplicazioni e proporre il riuso. Non implementare un secondo motore Pagamenti. Nessun deploy, push, merge o pubblicazione è autorizzato da questo documento.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 0. Scopo, prevalenza e modo d’uso

Questo documento sostituisce le stesure di lavoro precedenti sul dominio Pagamenti dove incompatibili e consolida le decisioni approvate fino al 21 agosto 2026. È pensato per essere consegnato a Claude Code come specifica di prodotto e come mandato di verifica tecnica prima dell’implementazione.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>REGOLA DI PREVALENZA</strong></p>
<p>Le decisioni più recenti confermate dall’owner prevalgono su audit, comportamento attuale del codice, test esistenti e documenti precedenti incompatibili. Il codice descrive ciò che esiste: non decide da solo ciò che è corretto.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Fonti interne principali utilizzate:

- VestiFlow_Contesto_Master_Progetto.docx — regole trasversali, tenant/location, idempotenza e metodo.

- VestiFlow_Piano_Master_Verifica_Completa.docx — censimento, causa radice, matrice di conformità, test UI/API/DB/E2E.

- VestiFlow_Analisi_Pagamenti_Tesoreria_v3_0_15-08-2026.docx — separazione piano/scadenza/movimento/allocazione, ciclo attivo/passivo, COD e registro.

- VestiFlow_Pagamenti_Specifica_Working_v0_2_21-08-2026.md — componente comune, Tipi pagamento, Corrispettivo manuale e campi della riga.

- VestiFlow_Specifica_Registro_Corrispettivi_e_Corrispettivo_Manuale_17-08-2026_AGGIORNATA.md — natura economica del Corrispettivo manuale e confine con il Registro.

- 11-specifica-vendita-al-banco.md — riferimento storico sul pagamento della Vendita al banco; la decisione del 21/08/2026 stabilisce che i documenti non espressamente elencati usano solo il Tipo pagamento condiviso.

- Schermate Danea Easyfatt fornite dall’owner il 21/08/2026 — benchmark operativo, non prova del modello dati interno.

- FatturaPA — Specifiche tecniche operative del formato, ver. 1.3.1 e rappresentazione tabellare v1.3 — codici TP/MP e campi DatiPagamento.
- docs/QUADRO-DECISIONI-FATTURE.md — BLOCCO D: modello a quattro concetti, comando «Preesistente», resa «parte di», dipendenza dal ramo cassa. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: non era fra le fonti, e alcune decisioni vivono solo lì.

## 0.1 Obiettivo sintetico

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DECISIONE CONFERMATA</strong></p>
<p>VestiFlow deve avere un solo dominio Pagamenti/Tesoreria e una sola anagrafica aziendale Tipi pagamento. La componente finanziaria completa è condivisa esclusivamente da Fattura, Fattura accompagnatoria, Nota di credito, Registrazione fattura fornitore e Corrispettivo manuale. Gli altri documenti pertinenti riusano soltanto il Tipo pagamento condiviso e non generano, per questo solo fatto, scadenze, movimenti, allocazioni o effetti di Tesoreria.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 0.2 Cosa significa “componente condivisa”

La condivisione ha due livelli distinti: (1) il selettore/anagrafica Tipo pagamento è trasversale ai documenti pertinenti; (2) la sezione Pagamento completa è una componente comune ma viene montata soltanto nei cinque documenti espressamente previsti. A livello tecnico non si impone un unico file Angular monolitico: Claude deve censire l’architettura e scegliere la forma di riuso più coerente.

- **Un solo dominio backend. Le regole di piano, scadenze, movimenti, allocazioni e saldi servono i documenti con componente Pagamento completa; gli altri documenti non devono attivarle solo perché espongono il Tipo pagamento.**

- **Un solo contratto API comune.** Endpoint e DTO non devono essere duplicati per Fattura, Corrispettivo manuale o ciclo passivo se il comportamento è identico.

- **Una libreria/componente UI comune.** Editor riga, lookup, modale dettaglio, griglia e riepiloghi devono essere riusati o composti da primitive condivise.

- **Adapter per documento. I cinque documenti con componente completa possono specificare direzione, soggetto predefinito, default, visibilità e permessi; gli altri consumer usano solo il selettore Tipo pagamento condiviso.**

- **Un solo set di anagrafiche condivise.** Creare una voce da un punto del gestionale la rende disponibile ovunque, nel rispetto del tenant.

# 1. Modello di dominio non negoziabile

Il sistema deve separare concetti che nella UI possono apparire vicini ma hanno significato diverso.

| **Concetto**          | **Significato**                                                                                                                                                                                           | **Natura**             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Tipo pagamento        | Preset aziendale leggibile dall’operatore: es. Bonifico 60 gg F.M., Contanti, Klarna via Stripe, Incasso corrispettivi.                                                                                   | Configurazione         |
| Modalità pagamento    | Classificazione standard/normativa del mezzo di pagamento: es. Bonifico, Contanti, Carta di pagamento.                                                                                                    | Lookup normativo       |
| Scadenza / partita    | Importo da regolare entro una data. È una previsione/posizione aperta, non denaro già entrato o uscito.                                                                                                   | Dato finanziario       |
| Movimento finanziario | Evento reale di entrata o uscita di denaro. Può esistere **prima di essere allocato del tutto**, con una quota non ancora applicata a nessuna partita. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** | Dato finanziario reale |
| Risorsa finanziaria   | Dove il denaro entra/esce: cassa, conto corrente, wallet o altra disponibilità reale.                                                                                                                     | Anagrafica condivisa   |
| Allocazione           | Quota di un movimento reale applicata a una o più partite.                                                                                                                                                | Relazione finanziaria  |
| Intermediario         | Corriere COD o provider che riscuote o riversa per conto dell’azienda. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**                                                                                 | Dato del movimento     |

Documento  
└─ Tipo pagamento / piano  
└─ Scadenza / partita  
▲  
│ allocazioni  
▼  
Movimento finanziario reale  
└─ Risorsa finanziaria

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>INVARIANTE</strong></p>
<p>Una scadenza non modifica da sola il saldo di una cassa o di una banca. Il saldo della risorsa cambia soltanto quando esiste un movimento finanziario reale.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 1.1 Relazione molti-a-molti

Il modello deve supportare sia più movimenti sulla stessa partita sia un unico movimento che regola più partite.

Esempio A — una partita, più movimenti  
Fattura € 500  
€ 100 Contanti  
€ 200 Carta  
€ 200 Bonifico

Esempio B — un movimento, più partite  
Bonifico reale € 1.114,09  
€ 369,18 → Fattura A  
€ 183,03 → Fattura B  
€ 561,88 → Fattura C

Non creare tre bonifici fittizi nell’esempio B. Deve esistere un movimento reale e tre allocazioni.

## 1.2 Stati finanziari derivati

Gli stati minimi sono Da saldare, Parziale, Saldato e Scaduto. Devono derivare da importo dovuto, date e allocazioni valide; non devono esistere come seconda fonte di verità scollegata dai movimenti.

Residuo = importo regolabile della partita − somma allocazioni valide

# 2. Anagrafiche e lookup condivisi

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DECISIONE CONFERMATA</strong></p>
<p>Gli elenchi configurabili del dominio Pagamenti sono condivisi a livello aziendale. Una voce creata da un documento diventa immediatamente disponibile negli altri contesti che usano la stessa anagrafica. Non creare copie per tipo documento.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.1 Modalità pagamento: catalogo normativo con codice

La Modalità pagamento è il livello standard a cui si agganciano i Tipi pagamento aziendali. Deve possedere il codice FatturaPA quando previsto. Il codice non è testo libero del documento e non deve essere duplicato in ogni Tipo pagamento.

Esempio confermato dall’owner:

Tipo pagamento aziendale: Bonifico 60 gg F.M.  
Modalità associata: Bonifico  
Codice FatturaPA: MP05  
Regola scadenza: 60 giorni fine mese  
Nel documento: Bonifico 60 gg F.M.  
Nel blocco FE: MP05 + scadenza/importo

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>VINCOLO</strong></p>
<p>Non costringere l’utente a conoscere o digitare MP05. L’associazione fra Modalità “Bonifico” e MP05 è centralizzata. Se il catalogo normativo esiste già nel repository, riusarlo e correggerlo; non crearne uno parallelo.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.2 Catalogo ufficiale ModalitaPagamento FatturaPA

| **Codice** | **Descrizione ufficiale**                  |
| ---------- | ------------------------------------------ |
| MP01       | Contanti                                   |
| MP02       | Assegno                                    |
| MP03       | Assegno circolare                          |
| MP04       | Contanti presso Tesoreria                  |
| MP05       | Bonifico                                   |
| MP06       | Vaglia cambiario                           |
| MP07       | Bollettino bancario                        |
| MP08       | Carta di pagamento                         |
| MP09       | RID                                        |
| MP10       | RID utenze                                 |
| MP11       | RID veloce                                 |
| MP12       | RIBA                                       |
| MP13       | MAV                                        |
| MP14       | Quietanza erario                           |
| MP15       | Giroconto su conti di contabilità speciale |
| MP16       | Domiciliazione bancaria                    |
| MP17       | Domiciliazione postale                     |
| MP18       | Bollettino di c/c postale                  |
| MP19       | SEPA Direct Debit                          |
| MP20       | SEPA Direct Debit CORE                     |
| MP21       | SEPA Direct Debit B2B                      |
| MP22       | Trattenuta su somme già riscosse           |
| MP23       | PagoPA                                     |

Fonte normativa di riferimento al 21/08/2026: FatturaPA, specifiche tecniche operative ver. 1.3.1 e rappresentazione tabellare fattura ordinaria v1.3. Claude deve comunque verificare la versione ufficiale vigente al momento dell’implementazione e dei test FE.

## 2.3 Tipi pagamento: anagrafica aziendale condivisa

Il Tipo pagamento è un preset creato e nominato dall’azienda. È quello che l’operatore vede nei documenti. Può essere creato da Impostazioni oppure dal pulsante di gestione accanto al campo Tipo pagamento.

**Questa anagrafica è trasversale: i documenti con componente finanziaria completa e i documenti che espongono soltanto il campo Tipo pagamento pescano dallo stesso elenco.**

| **Campo**           | **Requisito**                   | **Regola**                                                                                                    |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nome                | Obbligatorio                    | Etichetta aziendale: es. Bonifico 60 gg F.M., Klarna via Stripe, Incasso corrispettivi.                       |
| Modalità            | Obbligatoria quando applicabile | Riferimento al catalogo condiviso Modalità pagamento. Esempio: Bonifico → MP05.                               |
| Regola scadenza     | Obbligatoria                    | Immediata, N giorni, fine mese, più rate, personalizzata.                                                     |
| Risorsa predefinita | Opzionale                       | Precompila la risorsa quando coerente; non la rende non modificabile.                                         |
| Saldato di default  | Opzionale/contestuale           | Utile per tipi che rappresentano un incasso contestuale; non deve bypassare la creazione del movimento reale. |
| Attivo              | Sì                              | Le voci disattivate non sono proposte per nuovi documenti; lo storico resta leggibile.                        |
| Default             | Non duplicare il dato           | Preferibilmente configurato per contesto/documento o soggetto, non tramite copie del Tipo pagamento.          |

### 2.4 Tipi pagamento: esempi

| **Tipo aziendale**     | **Modalità**                                                  | **Piano**                          | **Nota**                          |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| Bonifico 60 gg F.M.    | Bonifico / MP05                                               | 60 giorni fine mese                | No                                |
| Bonifico 30/60 gg F.M. | Bonifico / MP05                                               | 2 rate: 30 e 60 gg F.M.            | No                                |
| Contanti               | Contanti / MP01                                               | Immediata                          | Configurabile                     |
| Klarna via Stripe      | Carta di pagamento / MP08                                     | Immediata o secondo configurazione | Configurabile                     |
| Contrassegno           | Modalità normativa da associare secondo scelta aziendale e FE | Secondo flusso                     | No incasso bancario automatico    |
| Incasso corrispettivi  | Modalità scelta in anagrafica                                 | Immediata                          | Default del Corrispettivo manuale |

## 2.5 Default: priorità senza duplicare Tipi

Il fatto che lo stesso Tipo pagamento possa essere usato ovunque non implica che debba essere predefinito ovunque. I default devono puntare all’anagrafica comune, non creare copie.

| **Contesto**                    | **Precompilazione**                                                                    | **Regola**                                            |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Corrispettivo manuale           | Incasso corrispettivi                                                                  | Default esplicito del contesto; resta modificabile.   |
| Fattura / accompagnatoria       | Tipo pagamento del cliente, se configurato; altrimenti default aziendale del documento | Non sovrascrivere una scelta già fatta nel documento. |
| Registrazione fattura fornitore | Tipo pagamento del fornitore, se configurato; altrimenti default passivo aziendale     | Direzione normalmente Uscita.                         |
| Nota di credito                 | Riusa la stessa anagrafica; il piano va coerentemente adattato all’effetto finanziario | NC non implica rimborso automatico.                   |

## 2.6 Risorse finanziarie

Le Risorse devono essere una sola anagrafica tenant/company-level. Esempi: Cassa contanti, Intesa Sanpaolo, conto corrente, wallet realmente movimentabile. Metodo/Modalità e Risorsa sono concetti distinti.

| **Campo funzionale**  | **Regola**                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Nome                  | Obbligatorio                                                                                      |
| Tipo risorsa          | Cassa / conto bancario / wallet o categorie già esistenti da censire                              |
| Saldo iniziale e data | Da usare solo come punto di avvio controllato; saldo corrente sempre derivato dai movimenti reali |
| Coordinate bancarie   | IBAN/BIC/istituto se la risorsa è un conto e se il modello esistente lo consente                  |
| Attiva                | Disattivata = non proposta nei nuovi movimenti, storico invariato                                 |
| Location              | Solo se ha significato reale; non renderla obbligatoria indiscriminatamente                       |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>ANTI-DUPLICAZIONE</strong></p>
<p>Prima di creare una nuova tabella Risorse verificare cash_sessions, pos_terminals, store_sale_payments, entità banca/cassa/IBAN e ramo cassa. Non creare “Risorsa”, “Conto bancario” e “Coordinate bancarie” come tre copie dello stesso concetto.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.7 Descrizioni pagamento

Descrizione utilizza un elenco aziendale configurabile e condiviso. Dal dettaglio pagamento deve essere possibile aprire la gestione inline, creare/modificare/disattivare una voce e usarla immediatamente. Il pattern UI va riusato da un gestore lookup già presente in VestiFlow (ad esempio quello usato da altre anagrafiche semplici) se tecnicamente compatibile.

Le modifiche all’elenco non riscrivono le descrizioni storiche già salvate nelle righe finanziarie.

## 2.8 Riferimento pagamento

Il campo deve supportare riferimenti operativi come N. assegno, CRO/TRN, numero distinta, riferimento provider o altri valori configurabili. Non creare colonne rigide “numero assegno” e “CRO” se un modello comune può rappresentarli.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>MODELLO FUNZIONALE</strong></p>
<p>La UI deve poter proporre preset condivisi e consentire il valore concreto del riferimento. La forma tecnica esatta (preset + valore, testo strutturato o altra soluzione già esistente) va scelta dopo il censimento. Lo storico deve conservare il testo/valore effettivamente registrato.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.9 Soggetto

Il Soggetto non è una nuova anagrafica Pagamenti. Deve riusare Clienti e Fornitori. Nel dettaglio generico Pagamenti è selezionabile; nei documenti viene precompilato dal soggetto del documento. Non creare una tabella duplicata “soggetti pagamento”.

# 3. Motore di scadenza dei Tipi pagamento

Il Tipo pagamento deve generare il piano di scadenza senza duplicare la logica in frontend e backend. Il backend/dominio è autoritativo; il frontend può mostrare l’anteprima.

| **Regola**         | **Comportamento**                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Immediata          | Data scadenza = data di riferimento del documento.                                               |
| N giorni           | Data di riferimento + N giorni.                                                                  |
| N giorni fine mese | Calcolo dei N giorni e successivo allineamento alla fine del mese secondo la regola configurata. |
| Rate multiple      | Una o più scadenze con intervalli configurati, es. 30/60/90.                                     |
| Personalizzata     | Piano modificabile manualmente sul documento, mantenendo somma e identità delle scadenze.        |

## 3.1 Esempio confermato

Data documento: 20/08/2026  
Tipo pagamento: Bonifico 60 gg F.M.  
Modalità normativa: Bonifico / MP05  
Scadenza risultante: 31/10/2026  
Importo: € 223,06

Il nome “Bonifico 60 gg F.M.” serve alla gestione interna e al calcolo. Nel dato FatturaPA della modalità entra MP05; la scadenza e l’importo sono serializzati come dati del piano.

## 3.2 Rate e arrotondamenti

La somma delle rate deve coincidere esattamente con il totale finanziario da regolare. Gli arrotondamenti devono essere deterministici e non lasciare centesimi dispersi.

€ 100 / 3 rate  
33,33 + 33,33 + 33,34 = 100,00

Il calcolo deve usare la rappresentazione monetaria canonica di VestiFlow e non affidarsi a float binari in punti critici.

## 3.3 Rigenerazione del piano

Cambiare Tipo pagamento sul documento deve poter ricalcolare le scadenze. Se non esistono movimenti reali/allocazioni, il piano può essere rigenerato. Se esistono pagamenti reali, non cancellare silenziosamente scadenze e allocazioni: preservare ciò che è già avvenuto e ripianificare soltanto il residuo o guidare la riconciliazione.

# 4. Componente comune “Pagamento” nei documenti

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DECISIONE CONFERMATA</strong></p>
<p>Fattura, Fattura accompagnatoria, Nota di credito, Registrazione fattura fornitore e Corrispettivo manuale devono usare lo stesso contratto funzionale e la stessa base UI Pagamento. Le differenze sono parametri/adattatori del documento.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 4.0 Perimetro della condivisione

**SCHEMA CANONICO**

```text
TIPI PAGAMENTO - ANAGRAFICA UNICA CONDIVISA

|

+--> Fattura ------------------------------\

+--> Fattura accompagnatoria |

+--> Nota di credito +--> COMPONENTE PAGAMENTO COMPLETA

+--> Registrazione fattura fornitore |

+--> Corrispettivo manuale ----------------/

|

+--> Vendita al banco --------------------> SOLO TIPO PAGAMENTO

+--> Reso al banco -----------------------> SOLO TIPO PAGAMENTO, se previsto nel documento

+--> altri documenti pertinenti ---------> SOLO TIPO PAGAMENTO
```

**Conseguenza: selezionare un Tipo pagamento in un documento del ramo “solo Tipo pagamento” non crea alcuna partita, scadenza, movimento finanziario, allocazione, Risorsa o stato Saldato. Il documento salva il Tipo scelto e basta. L’anagrafica da cui pesca resta la stessa usata dai documenti con componente completa.**

## 4.1 Struttura della sezione

- Tipo pagamento, con accesso alla gestione dell’anagrafica condivisa.

- Coordinate bancarie proprie quando pertinenti al documento attivo, ricondotte a una Risorsa/struttura bancaria esistente.

- Griglia di una o più righe di pagamento/scadenza.

- Riepilogo Da saldare / Regolato / Residuo.

- Azioni della barra comandi: **Preesistente · Acconto · Scadenza · Modifica · Rimuovi**, più registrare/saldare quando consentito. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** — ne elencava tre — e confermato dal riferimento visivo del 03/09/2026.
  - **Preesistente** aggancia alla riga un movimento **già registrato**, senza crearne uno nuovo: è il caso «un bonifico salda tre fatture» visto dal lato documento, mentre §9.4 lo copre solo dal lato registro.
  - **Acconto** è distinto da **Scadenza**: la scadenza è una previsione, l’acconto è denaro già ricevuto. ⚠️ Da non confondere con la fattura fiscale di acconto (§8.1).

- Apertura del dettaglio della riga con click o azione Modifica.
- Da una riga regolata si deve poter risalire al **movimento che l’ha regolata** e alla sua quota. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: con più movimenti su una scadenza, o un movimento su più fatture, la sola colonna Importo non basta — vedi la resa «parte di» in §9.1.

## 4.2 Colonne della griglia comune

| **Colonna**    | **Semantica**                                                                   |
| -------------- | ------------------------------------------------------------------------------- |
| Data scadenza  | Data prevista di regolamento.                                                   |
| Data saldo     | Data effettiva del regolamento; vuota finché non saldato.                       |
| Importo        | Importo della partita/riga.                                                     |
| Saldato        | Indicazione/azione UI del regolamento; la verità resta movimento + allocazione. |
| Risorsa        | Risorsa prevista/effettiva, secondo stato.                                      |
| Rif. pagamento | Riferimento operativo.                                                          |

## 4.3 Popup/dettaglio della singola riga

| **Campo**      | **Regola**                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Data scadenza  | Modificabile finché compatibile con pagamenti già allocati.                                                               |
| Risorsa        | Lookup condiviso + pulsante gestione inline. Richiesta per un movimento reale.                                            |
| Soggetto       | Cliente/fornitore; precompilato dal documento quando disponibile.                                                         |
| Data saldo     | Vuota se non saldato. Se si marca Saldato, precompilare con data coerente e lasciarla modificabile.                       |
| Descrizione    | Lookup aziendale condiviso + gestione inline.                                                                             |
| Rif. pagamento | Campo/preset condiviso + gestione inline; supporta N. assegno, CRO/TRN e altri.                                           |
| Modalità       | Modalità normativa associata/derivata dal Tipo pagamento; può essere modificabile secondo la riga ma deve restare valida. |
| Entrata        | Direzione positiva verso l’azienda. Non può coesistere con Uscita \> 0.                                                   |
| Uscita         | Direzione di pagamento/rimborso. Non può coesistere con Entrata \> 0.                                                     |
| Saldato        | Comando/stato UI. Se attivato deve produrre una regolazione finanziaria reale coerente.                                   |
| Allegati       | Opzionale, solo se l’infrastruttura comune esiste già; non è fondazione obbligatoria della prima tranche.                 |

## 4.4 Gestione inline delle anagrafiche

Per Tipo pagamento, Risorsa, Descrizione e Riferimento pagamento la UI deve poter aprire la gestione senza uscire dal documento. La creazione avviene nell’anagrafica condivisa, non “dentro la fattura”.

1.  L’utente apre il selettore e cerca una voce.

2.  Se manca, apre il pulsante di gestione accanto al campo.

3.  Crea o modifica la voce nell’anagrafica comune del tenant.

4.  Chiude il gestore e la nuova voce è subito disponibile e selezionabile nello stesso documento.

5.  La stessa voce è disponibile negli altri documenti che usano quel lookup.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>STORICO</strong></p>
<p>Una voce già usata non va cancellata in modo da rendere illeggibile lo storico. Se referenziata da documenti/movimenti, usare disattivazione o una strategia equivalente già prevista dal progetto.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 4.5 Entrata/Uscita e scadenza non saldata

La UI può mostrare Entrata/Uscita anche su una scadenza non ancora saldata per esprimere la direzione attesa. Questo non significa che il saldo della Risorsa sia già cambiato. Il movimento reale nasce solo al regolamento.

Fattura cliente € 223,06  
Riga pagamento:  
Entrata attesa € 223,06  
Scadenza 31/10/2026  
Saldato = NO  
⇒ saldo banca invariato

Quando saldata:  
Data saldo + Risorsa + movimento reale + allocazione  
⇒ saldo banca aggiornato

## 4.6 Semantica della checkbox Saldato

La checkbox richiesta dall’owner deve esistere, ma non può essere un booleano scollegato dalla tesoreria.

- **Da non saldato a saldato.** Richiede/coerentizza Data saldo, Risorsa, direzione e importo; crea o aggiorna il movimento reale e la relativa allocazione in modo atomico e idempotente.

- **Da saldato a non saldato.** Se la riga ha già un movimento persistito, non cancellare denaro in silenzio. Applicare una procedura di annullamento/storno/rimozione controllata coerente con il modello finale.

- **Documento ancora non salvato.** Le variazioni della checkbox sono stato del form; il movimento reale nasce solo nel commit valido.

# 5. Anagrafiche condivise, snapshot e modifica dei documenti

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DECISIONE CONFERMATA</strong></p>
<p>Cambiare un’anagrafica condivisa NON deve aggiornare automaticamente i documenti già creati. Se invece l’utente apre e modifica direttamente un documento, il documento deve aggiornarsi con i nuovi dati scelti.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 5.1 Esempio

Oggi:  
Fattura 100 → Bonifico 30 gg F.M. → Bonifico / MP05

Domani:  
nelle Impostazioni il Tipo viene rinominato o trasformato in Bonifico 60 gg F.M.

Atteso:  
Fattura 100 NON cambia automaticamente.

Se l’utente apre Fattura 100, cambia esplicitamente il Tipo pagamento e salva:  
il documento viene aggiornato secondo la nuova scelta.

Lo snapshot serve quindi a preservare il valore effettivamente usato dal documento: nome Tipo pagamento, modalità/codice rilevante, piano, scadenze, coordinate bancarie mostrate e altri dati necessari alla ricostruzione storica.

Per una fattura già trasmessa allo SdI, la copia XML trasmessa/archiviata non deve essere riscritta retroattivamente da una modifica anagrafica. Le modifiche fiscali successive seguono il workflow della Famiglia Fattura e non una propagazione automatica.

# 6. Coordinate bancarie e Risorsa

Nella Fattura attiva il campo “Ns coordinate bancarie” indica dove il cliente deve pagare. Danea lo gestisce come elenco separato visivamente; in VestiFlow non va duplicata una struttura senza censire ciò che esiste.

- Se una Risorsa di tipo conto corrente contiene IBAN/BIC/Istituto, può essere la sorgente delle coordinate mostrate.

- La scelta può precompilare la Risorsa della scadenza, ma resta modificabile secondo il dominio.

- Il documento salva lo snapshot delle coordinate mostrate, così modifiche future al conto non riscrivono le fatture storiche.

- Nel ciclo passivo, il conto del fornitore non è la stessa cosa della Risorsa aziendale da cui esce il denaro: non confondere beneficiario esterno e risorsa interna.

# 7. Integrazione nei documenti

## 7.1 Corrispettivo manuale

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DECISIONE 21/08/2026 — SOSTITUTIVA DEL “FUORI FASE” DEL 17/08</strong></p>
<p>Il Corrispettivo manuale entra ora nel dominio Pagamenti. La specifica del 17/08 che lo lasciava senza Pagamenti valeva per quella fase e viene superata per questo punto.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- **Tipo pagamento predefinito.** Incasso corrispettivi.

- **Componente.** Usa la stessa sezione Pagamento comune, non una mini-tesoreria dedicata.

- **Default.** Il Tipo precompila ma resta modificabile.

- **Soggetto.** Può essere vuoto se il Corrispettivo manuale non ha cliente; il motore comune non deve renderlo obbligatorio indiscriminatamente.

- **Location.** Resta obbligatoria per il Corrispettivo manuale secondo la specifica Corrispettivi; la relazione con la Risorsa finanziaria va mantenuta distinta.

- **Magazzino.** Zero effetti fisici. Pagamenti non devono introdurre StockMovement.

- **Registro Corrispettivi.** Continua a essere economico; il movimento di Tesoreria non deve duplicare l’importo nel Registro Corrispettivi.

Nel nuovo documento la riga iniziale può essere precompilata secondo il Tipo “Incasso corrispettivi”. Se il Tipo è configurato come immediato/saldato con una Risorsa predefinita, al salvataggio valido il motore registra coerentemente il movimento reale; finché il totale del documento cambia in compilazione, evitare movimenti anticipati e duplicazioni.

## 7.2 Fattura

- Usa il componente comune.

- Il Tipo pagamento genera una o più scadenze.

- Supporta incassi immediati, futuri, parziali e multipli.

- La sezione mostra Da saldare, Saldato/Regolato e Residuo.

- Le informazioni FatturaPA derivano dallo stesso piano e dalla Modalità normativa, senza una seconda configurazione FE parallela.

- Le coordinate bancarie proprie sono selezionabili dove pertinenti.

## 7.3 Fattura accompagnatoria

Stesso motore della Fattura. Non deve esistere una variante Pagamenti propria. Le differenze della Fattura accompagnatoria riguardano il dominio fisico/documentale, non la Tesoreria.

## 7.4 Nota di credito

Usa lo stesso dominio, ma Nota di credito ≠ rimborso monetario.

| **Caso**                   | **Effetto**                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Fattura ancora aperta + NC | La NC può ridurre/compensare la posizione da incassare. Nessun movimento bancario automatico. |
| Fattura già saldata + NC   | Nasce una posizione a favore del cliente. Nessuna Uscita automatica.                          |
| Rimborso reale             | Movimento Uscita dalla Risorsa effettiva + allocazione alla posizione/credito pertinente.     |

## 7.5 Registrazione fattura fornitore

Deve convergere sullo stesso dominio Pagamenti. Le scadenze passive eventualmente già presenti non vanno sostituite con un secondo motore.

- Soggetto = Fornitore precompilato.

- Direzione prevista = Uscita.

- Tipo pagamento selezionato dall’anagrafica comune.

- Scadenze comuni con identità stabile.

- Pagamento reale dalla Risorsa aziendale.

- Stati e residui derivati dalle allocazioni.

## 7.6 Altri documenti: solo Tipo pagamento condiviso

La regola generale è: tutti i documenti non compresi nell’elenco della componente Pagamento completa possono esporre il solo campo Tipo pagamento, sempre collegato alla stessa anagrafica aziendale condivisa. La Vendita al banco mostrata dall’owner il 21/08/2026 è il caso concreto di riferimento.

- Tipo pagamento condiviso. Stesso elenco di Fattura, Corrispettivo manuale e altri consumer; nessuna tabella o lookup locale.

- Nessun effetto finanziario automatico. La sola selezione del Tipo non crea scadenze, partite, movimenti, allocazioni, Risorse o stato Saldato.

- Nessuna convergenza forzata. Vendita al banco e Reso al banco non devono montare la componente Pagamento completa salvo futura decisione esplicita dell’owner.

- Persistenza. Il documento conserva il Tipo pagamento scelto secondo il proprio contratto; eventuali documenti fiscali generati useranno le proprie regole senza duplicare l’anagrafica.

## 7.7 Shopify e Contrassegno

Shopify, Vendita al banco e gli altri documenti/flussi non espressamente inclusi nella componente completa usano il Tipo pagamento condiviso secondo il proprio contratto. Il Contrassegno resta un Tipo/metodo di pagamento, non un documento e non un Corrispettivo manuale. Un eventuale riversamento reale del corriere è un movimento finanziario autonomo nell’area Pagamenti e non significa che il documento di vendita monti la componente completa.

Vendita: Contrassegno  
Intermediario: GLS/BRT  
Cliente paga al corriere  
Successivamente:  
Bonifico reale del corriere → conto aziendale  
Un bonifico può coprire più vendite → un movimento + N allocazioni

Non inventare un incasso bancario al checkout Shopify. Il metodo della vendita e la modalità del movimento reale possono essere diversi.

⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** — due confini che il documento del 15/08 dichiarava e che qui erano spariti:

- **gli importi economici originari delle vendite Shopify non vengono ricalcolati localmente**: il metodo importato è la fotografia della transazione. Non è la stessa cosa di «non riscrivere l’ordine»: qui si vieta di rifare i conti, non di scrivere;
- **l’onboarding/cutover Shopify resta fuori da questo lavoro.**

# 8. Fatturazione elettronica — DatiPagamento

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>REGOLA FISCALE DI MODELLO</strong></p>
<p>Nel documento l’utente sceglie un Tipo pagamento aziendale. Nell’XML non entra il nome libero del Tipo: entra la Modalità normativa codificata e il piano di pagamento previsto dal tracciato.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 8.1 CondizioniPagamento

| **Codice** | **Significato**    |
| ---------- | ------------------ |
| TP01       | Pagamento a rate   |
| TP02       | Pagamento completo |
| TP03       | Anticipo           |

Regola di generazione:

- Piano con più rate effettive → TP01.

- Una sola scadenza che copre il pagamento completo → TP02.

- TP03 va usato soltanto quando il piano/documento rappresenta realmente un anticipo secondo il tracciato; non inferirlo solo perché la data saldo è anticipata.

⛔ **La fattura fiscale di acconto/anticipo resta FUORI da questo perimetro.** ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: qui si parla di **denaro realmente ricevuto** su una fattura già emessa (PAY-016), che è un’altra cosa dall’emettere un documento fiscale di acconto. È il punto in cui i due si confondono più facilmente, ed è proprio dove il confine era sparito.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>NOTA TECNICA</strong></p>
<p>Se il repository possiede già una regola FE diversa o un campo esplicito per TP01/TP02/TP03, Claude deve censirlo, verificarlo sulle specifiche correnti e generalizzarlo. Non mantenere due fonti di verità.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 8.2 DettaglioPagamento

| **Campo FE**                                 | **Obbligatorietà**                | **Origine VestiFlow**                                     |
| -------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| ModalitaPagamento                            | Obbligatorio nel dettaglio        | Codice MP01–MP23 dalla Modalità condivisa.                |
| DataRiferimentoTerminiPagamento              | Opzionale                         | Data dalla quale decorrono i termini, se usata.           |
| GiorniTerminiPagamento                       | Opzionale                         | Numero giorni; 0 per pagamento a vista secondo specifica. |
| DataScadenzaPagamento                        | Opzionale secondo senso del piano | Data di scadenza calcolata/snapshot del documento.        |
| ImportoPagamento                             | Obbligatorio                      | Importo della scadenza/dettaglio.                         |
| IstitutoFinanziario / IBAN / ABI / CAB / BIC | Opzionali                         | Dati bancari quando pertinenti e disponibili.             |

## 8.3 Esempio VestiFlow → FatturaPA

Fattura n. 20  
Data: 20/08/2026  
Totale: € 223,06  
Tipo pagamento VestiFlow: Bonifico 60 gg F.M.  
Modalità condivisa: Bonifico  
Codice: MP05  
Scadenza: 31/10/2026

Piano logico FE:  
CondizioniPagamento = TP02  
DettaglioPagamento:  
ModalitaPagamento = MP05  
DataScadenzaPagamento = 2026-10-31  
ImportoPagamento = 223.06  
IBAN / Istituto = se previsti dalle coordinate selezionate

L’esempio è coerente con il comportamento osservato in Danea e con il tracciato FatturaPA. Il serializer reale deve essere verificato contro XSD e specifiche ufficiali vigenti, senza inventare campi opzionali non necessari.

## 8.4 Validazioni FE

- Un documento da trasmettere non può serializzare una Modalità priva di codice valido quando il blocco DatiPagamento viene generato.

- Il codice MP deve provenire dal catalogo condiviso, non dal testo del Tipo pagamento.

- Le scadenze dell’XML devono corrispondere al piano del documento.

- La somma degli ImportoPagamento deve essere coerente con l’importo da regolare secondo il contratto fiscale del documento.

- Le modifiche anagrafiche successive non devono cambiare l’XML storico.

- Testare almeno MP01, MP05, MP08, MP12 e un piano a più rate.

# 9. Area centrale “Pagamenti”

Tutte le partite e i movimenti integrati confluiscono nella stessa area Pagamenti. La sezione centrale non copia i dati in un secondo archivio: interroga e gestisce le stesse entità finanziarie comuni.

| **Vista**  | **Significato**                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| Tutti      | Partite e movimenti pertinenti, con distinzione chiara fra previsione e denaro reale. |
| Entrate    | Movimenti/direzioni di incasso.                                                       |
| Uscite     | Pagamenti/rimborsi.                                                                   |
| Da saldare | Partite aperte.                                                                       |
| Parziali   | Partite con allocazione parziale.                                                     |
| Saldati    | Partite completamente regolate.                                                       |
| Scaduti    | Partite aperte oltre la data scadenza.                                                |

## 9.1 Colonne

| **Colonna**         | **Nota**                                                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                | Data rilevante della riga/movimento.                                                                                                                                                                                                                                 |
| Data scadenza       | Per partite/scadenze.                                                                                                                                                                                                                                                |
| Data saldo          | Per regolamenti reali.                                                                                                                                                                                                                                               |
| Soggetto            | Cliente/fornitore.                                                                                                                                                                                                                                                   |
| Descrizione         | Descrizione finanziaria.                                                                                                                                                                                                                                             |
| Modalità pagamento  | Modalità condivisa/normativa.                                                                                                                                                                                                                                        |
| Tipo pagamento      | Preset aziendale, dove utile.                                                                                                                                                                                                                                        |
| Risorsa             | Cassa/conto/wallet.                                                                                                                                                                                                                                                  |
| Entrate / Uscite    | Direzione chiara.                                                                                                                                                                                                                                                    |
| Saldato / Stato     | Stato derivato.                                                                                                                                                                                                                                                      |
| Documento / Origine | Fattura, Fattura accompagnatoria, Nota di credito, Registrazione fattura fornitore, Corrispettivo manuale e movimenti finanziari autonomi. Un documento “solo Tipo pagamento” non entra qui per la sola selezione del Tipo.                                          |
| Importo / Residuo   | Importo dovuto e residuo. Su un’allocazione parziale si mostra anche il movimento di cui fa parte: **€ 38,51 (parte di € 80,37)**. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** — requisito UX osservato nel registro Danea, non prova del suo schema interno. |
| Intermediario       | Corriere/provider del movimento, dove valorizzato: senza, un riversamento COD non è filtrabile né riconciliabile per corriere. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**                                                                                    |
| Rif. pagamento      | CRO/TRN, assegno, provider, ecc.                                                                                                                                                                                                                                     |

## 9.2 Filtri minimi

- Periodo

- Stato

- Risorsa

- Soggetto

- Modalità/Tipo pagamento

- Origine / tipo documento

Location e canale vanno aggiunti solo dove il dato è affidabile e utile; non inventare fallback.

## 9.3 Azioni

- Nuovo incasso / pagamento

- Modifica

- Saldo multiplo

- Giroconto

- Consultazione allocazioni

- Gestione Risorse

- Allegati/export/stampa solo se riusano infrastrutture comuni e senza bloccare il motore fondamentale

## 9.4 Saldo multiplo

Bonifico ricevuto € 1.000  
Fattura A € 300  
Fattura B € 500  
Fattura C € 200

Atteso:  
1 movimento reale da € 1.000  
3 allocazioni  
0 movimenti fittizi aggiuntivi

## 9.5 Giroconto

Uno spostamento fra due Risorse aziendali non è ricavo/costo né pagamento cliente/fornitore. Deve essere un evento atomico collegato: uscita dalla Risorsa A + entrata nella Risorsa B, senza duplicazione su retry.

# 10. Modifica, eliminazione, disattivazione e storicità

| **Oggetto**                         | **Regola**                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Tipo/Modalità/Risorsa/lookup master | Modifica il default futuro; non riscrive documenti o movimenti storici.                                                 |
| Documento senza movimenti reali     | Piano e scadenze possono essere rigenerati/modificati.                                                                  |
| Documento con movimenti allocati    | Preservare i movimenti; riconciliare residuo/eccedenza; non cancellare scadenze saldate in silenzio.                    |
| Movimento reale                     | Non hard-delete distruttivo se già usato; prevedere annullamento/storno/rimozione auditabile secondo modello esistente. |
| Voce master usata                   | Preferire disattivazione: non proposta ai nuovi documenti, storico leggibile.                                           |

# 11. Tenant, Location, sicurezza e idempotenza

- **Tenant/company.** Ogni Tipo pagamento aziendale, Risorsa, descrizione configurabile, riferimento, partita, movimento e allocazione deve essere isolato. Nessuna lettura o allocazione cross-tenant.

- **Catalogo normativo.** I codici MP possono essere riferimento di sistema condiviso; le personalizzazioni aziendali non devono diventare visibili fra tenant.

- **Location.** Collegarla solo dove ha significato reale. Corrispettivo manuale mantiene la Location obbligatoria; una Risorsa non deve avere Location obbligatoria se è un conto aziendale usato da più sedi.

- **Permessi.** Separare almeno consultazione, creazione/modifica movimenti, gestione anagrafiche e operazioni sensibili se il sistema permessi esistente lo consente.

- **Idempotenza.** Doppio click, retry HTTP, autosalvataggio, risposta lenta e riapertura non devono duplicare scadenze, movimenti o allocazioni.

- **Transazioni.** Creazione movimento + allocazioni e operazioni di giroconto devono essere atomiche.

# 12. Censimento tecnico obbligatorio: prima di implementare

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>BLOCKER</strong></p>
<p>Non creare migration o nuove tabelle finché non è stato dimostrato che le strutture esistenti non sono riutilizzabili. Il numero di tabelle non è un requisito.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Claude deve mappare almeno:

- \`DocumentPaymentInstallment\` e stabilità degli ID delle scadenze

- eventuale delete-and-recreate delle scadenze al salvataggio

- \`paymentTerms\`, \`paymentMethod\`, \`paymentDueDate\`, IBAN e snapshot

- Impostazioni / Pagamenti esistenti

- \`store_sale_payments\`

- \`cash_sessions\`

- \`pos_terminals\`

- pagamenti Vendita al banco e Reso

- dati pagamento Shopify / gateway / COD

- Registrazione fattura fornitore e scadenzario passivo

- serializer/generator FatturaPA e blocco DatiPagamento

- tabelle finanziarie presenti nel DB ma non in Prisma

- infrastrutture generiche per lookup configurabili e gestione inline

- anagrafiche banca/cassa/IBAN

- permessi, audit e policy RLS

| **Voce relazione**  | **Contenuto richiesto**                                |
| ------------------- | ------------------------------------------------------ |
| Esistenza           | esiste / parziale / mancante / divergente / altro ramo |
| File e funzione     | Percorso, classe/funzione, endpoint e consumer         |
| DB                  | Tabelle, colonne, FK, indici, vincoli, tenant          |
| Comportamento reale | UI → API → DB, non dedotto dalla build                 |
| Riuso               | Riutilizzabile, generalizzabile o da ritirare          |
| Causa radice        | Per ogni divergenza                                    |
| Rischio regressione | Documenti/servizi che consumano il componente          |
| Test                | Esistenti, mancanti, da aggiornare                     |
| Migration           | Necessaria o no, con la dimostrazione                  |
| Decisione aperta    | Dove serve ancora una decisione funzionale dell’owner  |

⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** — **tre domande a cui il censimento deve rispondere**, non solo tre tabelle da elencare: era la parte che indirizzava il lavoro invece di descriverlo.

1. `store_sale_payments` rappresenta un **movimento reale**, un tender di cassa, o altro?
2. `cash_sessions` può diventare una **Risorsa** e generare movimenti, o è un dominio separato che resta tale?
3. `pos_terminals` è **solo un terminale**, o contiene un saldo?

⚠️ E resta la domanda che le governa tutte: **come si evita di avere un secondo motore finanziario** accanto a quello esistente.

## 12.1 Regola anti-duplicazione

Se esistono già due implementazioni parziali dello stesso concetto, Claude non deve semplicemente aggiungerne una terza “corretta”. Deve:

> 1\. identificare i consumer di entrambe;
>
> 2\. scegliere/estrarre il contratto comune;
>
> 3\. migrare i consumer in modo progressivo;
>
> 4\. preservare dati e identità quando necessario;
>
> 5\. rimuovere il percorso legacy solo dopo prova di equivalenza e regressione.

# 13. Target tecnico: vincoli, non schema imposto

Il documento non impone nomi di tabelle o classi. Impone però proprietà che il modello tecnico finale deve garantire.

| **Proprietà**             | **Requisito**                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identità stabile scadenze | Una partita con allocazioni non può essere cancellata e ricreata a ogni save perdendo l’ID.                                                                                                                             |
| Movimenti separati        | Il saldo risorsa deriva da movimenti reali, non da scadenze.                                                                                                                                                            |
| Allocazioni con importo   | Relazione N:N con importo allocato e vincoli.                                                                                                                                                                           |
| Non-sovrallocazione       | **Gli importi allocati non superano il disponibile del movimento**, salvo la procedura esplicita di credito/eccedenza (§17). ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: era diventato un generico «e vincoli». |
| Movimento non allocato    | Un movimento può avere una **quota non allocata**: il modello deve saperla rappresentare e mostrarla, non forzarne l’azzeramento. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**                                    |
| Snapshot documentale      | Il documento conserva dati effettivamente usati.                                                                                                                                                                        |
| Lookup condivisi          | Una sola anagrafica aziendale per concetto; no copie per documento.                                                                                                                                                     |
| Modalità normativa        | Codice MP centralizzato e validato.                                                                                                                                                                                     |
| Tenant                    | Chiavi/where/vincoli coerenti.                                                                                                                                                                                          |
| Idempotenza               | Chiave o vincolo equivalente nei percorsi ripetibili.                                                                                                                                                                   |
| Audit                     | Operazioni finanziarie reali tracciabili.                                                                                                                                                                               |

## 13.1 Confine frontend/backend

- Il frontend presenta, valida localmente e mostra anteprime.

- Il backend applica regole monetarie, scadenze, stati derivati, allocazioni e idempotenza.

- Non duplicare formule di scadenza in più componenti.

- Non affidare il saldo di una Risorsa a calcoli frontend.

# 14. Sequenza di realizzazione

| **Fase** | **Blocco**                                 | **Risultato**                                                                                                                                                                     |
| -------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Censimento e fotografia tecnica            | Nessuna modifica. Mappa dipendenze, duplicati, FE esistente, scadenzario passivo, cassa.                                                                                          |
| P1       | Fondazioni condivise                       | Catalogo Modalità, Tipi pagamento, lookup inline, Risorse, identità stabile scadenze.                                                                                             |
| P2       | Motore finanziario                         | Movimenti, allocazioni, saldi risorse, idempotenza.                                                                                                                               |
| P3       | Componente Pagamento comune                | Griglia, popup, riepiloghi, CRUD e adapter documento.                                                                                                                             |
| P4       | Corrispettivo manuale                      | Default Incasso corrispettivi, nessun effetto stock.                                                                                                                              |
| P5       | Fattura + accompagnatoria                  | Piano, scadenze, coordinate e DatiPagamento FE.                                                                                                                                   |
| P6       | Ciclo passivo                              | Convergenza Registrazione fattura fornitore.                                                                                                                                      |
| P7       | Nota di credito                            | Compensazione/credito/rimborso separato.                                                                                                                                          |
| P8       | Consumer solo Tipo pagamento + Shopify/COD | Verifica che Vendita/Reso e altri documenti usino l’anagrafica Tipi condivisa senza montare la componente completa; gestire eventuali riversamenti reali come movimenti autonomi. |
| P9       | Registro Pagamenti                         | Viste, filtri, saldo multiplo, giroconto.                                                                                                                                         |
| P10      | Regressione completa                       | UI/API/DB/E2E/manuale, multi-tenant e FE.                                                                                                                                         |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>GATE</strong></p>
<p>Dopo P0 Claude deve restituire fotografia tecnica, cause radice, proposta di riuso e schema/migration realmente necessari. Solo dopo approvazione si procede all’implementazione. Nessun deploy/push/merge è implicito.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 15. Criteri di accettazione e test obbligatori

| **ID**  | **Area**                      | **Atteso**                                                                                                       |
| ------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PAY-001 | Tipo condiviso                | Creo “Bonifico 60 gg F.M.” da una fattura; la voce compare anche negli altri documenti del tenant.               |
| PAY-002 | Tenant                        | Il Tipo creato nel Tenant A non è visibile nel Tenant B.                                                         |
| PAY-003 | Modalità/MP                   | Bonifico usa MP05; l’utente non deve digitare MP05 nel documento.                                                |
| PAY-004 | FE mapping                    | Tipo “Bonifico 60 gg F.M.” → Modalità Bonifico → XML ModalitaPagamento MP05.                                     |
| PAY-005 | Scadenza                      | 20/08/2026 + 60 gg F.M. → 31/10/2026.                                                                            |
| PAY-006 | Piano 30/60                   | €1.000 → due rate coerenti e somma esatta €1.000.                                                                |
| PAY-007 | Arrotondamento                | €100/3 → 33,33 + 33,33 + 33,34.                                                                                  |
| PAY-008 | Snapshot master               | Cambio il Tipo in anagrafica: una fattura esistente non cambia da sola.                                          |
| PAY-009 | Modifica documento            | Cambio esplicitamente Tipo nella fattura: piano/documento si aggiornano senza duplicati.                         |
| PAY-010 | Risorsa inline                | Creo “Banco BPM” dal popup e la vedo subito in tutti i lookup Risorsa del tenant.                                |
| PAY-011 | Descrizione inline            | Nuova descrizione disponibile immediatamente e riusata altrove.                                                  |
| PAY-012 | Rif. pagamento                | Registro CRO/TRN o N. assegno senza creare colonne specifiche per ogni caso.                                     |
| PAY-013 | Scadenza non saldata          | Riga futura non modifica saldo banca.                                                                            |
| PAY-014 | Saldato                       | Marcando saldato con data/risorsa nasce un solo movimento reale e un’allocazione.                                |
| PAY-015 | Retry saldato                 | Doppio click/retry non duplica movimento né allocazione.                                                         |
| PAY-016 | Parziale                      | Fattura €183,03 + incasso €30 → residuo €153,03.                                                                 |
| PAY-017 | Più movimenti                 | Tre incassi sulla stessa partita → tre movimenti, residuo derivato.                                              |
| PAY-018 | Saldo multiplo                | Un bonifico salda tre fatture → un movimento, tre allocazioni.                                                   |
| PAY-019 | Eccedenza                     | Ricevuto \> dovuto: fattura invariata; eccedenza non allocata/credito secondo policy, nessun artificio.          |
| PAY-020 | Corrispettivo manuale default | Nuovo Corrispettivo manuale precompila Incasso corrispettivi.                                                    |
| PAY-021 | Corrispettivo stock           | Pagamento Corrispettivo manuale non crea StockMovement.                                                          |
| PAY-022 | Fattura accompagnatoria       | Usa lo stesso motore Pagamenti della Fattura.                                                                    |
| PAY-023 | Ciclo passivo                 | Fattura fornitore usa lo stesso dominio e genera Uscita al pagamento reale.                                      |
| PAY-024 | NC aperta                     | NC su fattura aperta riduce/compensa senza movimento banca automatico.                                           |
| PAY-025 | NC saldata                    | NC su fattura saldata non crea rimborso automatico.                                                              |
| PAY-026 | Rimborso NC                   | Rimborso reale → movimento Uscita su Risorsa + allocazione.                                                      |
| PAY-027 | COD                           | Checkout Contrassegno non crea incasso bancario fittizio.                                                        |
| PAY-028 | Riversamento COD              | Un bonifico corriere multi-vendita → un movimento + più allocazioni.                                             |
| PAY-029 | Disattivazione                | Risorsa/Tipo disattivato non proposto nei nuovi documenti; storico integro.                                      |
| PAY-030 | Cross-tenant allocazione      | Impossibile allocare movimento Tenant A a partita Tenant B.                                                      |
| PAY-031 | Giroconto                     | Uscita A + Entrata B come stesso evento logico e idempotente.                                                    |
| PAY-032 | FE TP02                       | Una scadenza completa → CondizioniPagamento TP02.                                                                |
| PAY-033 | FE TP01                       | Più rate → CondizioniPagamento TP01.                                                                             |
| PAY-034 | FE storico                    | Modifica anagrafica non cambia XML già generato/archiviato.                                                      |
| PAY-035 | Modifica con incasso          | Riduzione/aumento totale dopo incasso preserva movimento e riconcilia solo residuo/eccedenza.                    |
| PAY-036 | Identità scadenza             | Riapertura/save non cambia ID di scadenze già allocate.                                                          |
| PAY-037 | Vendita al banco - selector   | Selezionare un Tipo pagamento usa l’anagrafica condivisa ma non crea scadenze, movimenti, allocazioni o Risorse. |
| PAY-038 | Consumer solo Tipo            | Un nuovo Tipo creato da Fattura compare anche nei documenti type-only; nessuna copia locale viene creata.        |

| PAY-039 | Due strumenti, una fattura | Una fattura saldata con **due metodi/risorse diversi** → due movimenti distinti, residuo 0. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** (PAG-006) |
| PAY-040 | Scadenza saldata | Una scadenza già saldata non si elimina in silenzio: la regola di §10 ha il suo test. ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026** (PAG-011) |

## 15.1 Livelli di test

| **Livello**      | **Deve dimostrare**                                                                   |
| ---------------- | ------------------------------------------------------------------------------------- |
| Unitario         | Calcolo scadenze, rate, rounding, stato derivato, mapping MP/TP, vincoli allocazione. |
| API/integrazione | CRUD anagrafiche, transazioni movimento+allocazioni, autorizzazioni, idempotenza.     |
| Database         | FK, tenant, identità stabile, record creati/modificati, saldi derivati.               |
| Frontend         | Lookup condivisi, gestione inline, popup, default, modifiche, errori e focus.         |
| E2E              | Documento → Pagamento → Registro → FE/DB e ritorno.                                   |
| Manuale          | Usabilità reale desktop/mobile e confronto con i casi mostrati dall’owner.            |

# 16. Rischi di regressione da dichiarare prima di ogni tranche

| **Area**            | **Rischio**                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scadenzario passivo | Generalizzazione può rompere fatture fornitore esistenti.                                                                                                                                   |
| Vendita al banco    | Non interpretare \`store_sale_payments\` o il campo Tipo pagamento come prova che la Vendita al banco debba avere scadenze/movimenti. Il target attuale è solo il Tipo pagamento condiviso. |
| Cassa/POS           | cash_sessions/pos_terminals non vanno trasformati in Risorsa senza prova.                                                                                                                   |
| FatturaPA           | Mapping esistente MP/TP e serializer possono già avere consumer/documenti storici.                                                                                                          |
| Snapshot            | Rimozione FK o cambio lookup può alterare la lettura dei documenti storici.                                                                                                                 |
| Corrispettivi       | Il pagamento non deve raddoppiare i totali economici del Registro.                                                                                                                          |
| Nota di credito     | Compensazione economica e rimborso reale non devono confondersi.                                                                                                                            |
| Shopify/COD         | Non generare incassi fittizi o riscrivere dati ordine/corrispettivo.                                                                                                                        |
| Tenant              | Lookup condiviso non significa dati aziendali globali fra tenant.                                                                                                                           |

# 17. Punti ancora aperti: non inventare

Questa specifica chiude il nucleo Pagamenti e le anagrafiche condivise, ma alcune decisioni di flussi periferici restano aperte. Claude non deve riempirle con supposizioni.

| **Punto**                                | **Vincolo attuale**                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendita/Reso al banco - perimetro        | Decisione chiusa per questa specifica: solo Tipo pagamento condiviso. Nessuna componente finanziaria completa e nessun pagamento misto da introdurre senza futura richiesta esplicita. |
| Rimborso Reso al banco                   | Va collegato al dominio Uscite, ma il comportamento operativo del Reso è ancora da chiudere.                                                                                           |
| Eccedenza/credito non allocato           | Il motore deve supportarla senza alterare fattura; policy UX/contabile finale da approvare.                                                                                            |
| Permessi granulari                       | Censire il sistema esistente prima di fissare nuovi ruoli.                                                                                                                             |
| Location / Risorsa                       | Nessuna obbligatorietà generalizzata; definire solo sui casi reali.                                                                                                                    |
| Ri.Ba./SDD/home banking avanzato         | I codici/modalità sono supportati; emissione flussi bancari è funzione successiva.                                                                                                     |
| Compensazione NC nel modello dati        | ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: l’effetto funzionale è deciso (§7.4), la **forma tecnica** della compensazione no. Va approvata dopo il censimento.                |
| Intermediari/provider oltre al COD       | ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: il campo Intermediario esiste per il riversamento del corriere; se e come usarlo per altri provider è da decidere.                 |
| Cancellazione/storno dei movimenti reali | ⭐ **Recuperato dall’Analisi v3.0 del 15/08/2026**: §4.6 e §10 rinviano «al modello esistente». La **policy** va approvata, non dedotta.                                               |

# Appendice A — Evidenze visuali Danea usate come benchmark

Le schermate seguenti sono usate per comprendere il comportamento operativo desiderato. Non dimostrano lo schema interno di Danea e non autorizzano a copiarlo senza adattamento all’architettura VestiFlow.

<img src="media/image1.png" style="width:5.82677in;height:3.61069in" />

_A1 — Dettaglio riga pagamento: Data scadenza, Risorsa, Soggetto, Data saldo, Descrizione, Modalità, Rif. pagamento, Entrata/Uscita, Saldato._

| **Lettura**  | **Conclusione**                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| Dimostra     | Campi operativi e gestione inline di Risorsa, Descrizione e Riferimento.              |
| Non dimostra | Che Danea usi una singola tabella o lo stesso modello tecnico proposto per VestiFlow. |

<img src="media/image2.png" style="width:6.22047in;height:4.17354in" />

_A2 — Scheda Pagamento della Fattura: Tipo pagamento, coordinate bancarie, griglia scadenze e riepilogo._

<img src="media/image3.png" style="width:5.62992in;height:3.532in" />

_A3 — Gestione Tipi pagamento: il Tipo è un preset configurabile con Modalità e regola di scadenza._

<img src="media/image4.png" style="width:4.96063in;height:4.3327in" />

_A4 — Elenco Modalità disponibili nel Tipo pagamento: livello standard distinto dal nome aziendale del Tipo._

<img src="media/image5.png" style="width:5.43307in;height:4.3679in" />

_A5 — Rappresentazione della Fattura elettronica: Tipo aziendale “Bonifico 60 gg F.M.” tradotto in Modalità MP05 Bonifico e scadenza 31/10/2026._

## **A6 — Vendita al banco: solo Tipo pagamento condiviso**

<img src="media/image6.png" style="width:6.10236in;height:2.92963in" />

_A6 — Evidenza operativa: la Vendita al banco espone il solo selettore Tipo pagamento, alimentato dalla stessa anagrafica condivisa._

**Conseguenza di specifica: questo consumer non deve generare automaticamente scadenze, movimenti, allocazioni o Risorse.**

# Appendice B — Output obbligatorio di Claude dopo il censimento

Prima di qualunque migration o implementazione sostanziale, Claude deve restituire un rapporto con questa struttura:

| **Output**                     | **Contenuto**                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| 1\. Mappa componenti           | UI, servizi, API, modelli DB, serializer FE, test, job/rami rilevanti.                   |
| 2\. Matrice conformità         | Conforme / Parziale / Non conforme / Non implementato / Non verificabile / Fuori ambito. |
| 3\. Duplicazioni               | Motori/lookup sovrapposti e strategia di convergenza.                                    |
| 4\. Causa radice               | Per ogni divergenza, non solo sintomo.                                                   |
| 5\. Schema proposto            | Solo dopo il riuso: entità, FK, indici, tenant, identity e migration necessarie.         |
| 6\. Piano per fasi             | Blocchi piccoli, dipendenze e rischi regressione.                                        |
| 7\. Test                       | Unit, API, DB, frontend, E2E e manuali con ID PAY-\*.                                    |
| 8\. Nessuna operazione esterna | Niente push, merge, deploy o pubblicazione senza richiesta esplicita dell’owner.         |

# Appendice C — Regola sintetica canonica

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>REGOLA CANONICA</strong></p>
<p>Il pagamento in VestiFlow è un dominio condiviso. Il Tipo pagamento è un preset aziendale in un’anagrafica unica e trasversale; la Modalità pagamento è il livello standard/normativo con codice FatturaPA. Solo Fattura, Fattura accompagnatoria, Nota di credito, Registrazione fattura fornitore e Corrispettivo manuale montano la componente Pagamento completa: il Tipo genera il piano e le scadenze; una scadenza non è denaro; il denaro reale è un Movimento su una Risorsa; le Allocazioni collegano movimenti e partite. Gli altri documenti pertinenti usano soltanto il Tipo pagamento condiviso e la sua selezione non crea effetti di Tesoreria. Creare una voce da un documento significa crearla nell’anagrafica aziendale comune, non in un elenco locale. Prima di aggiungere tabelle o servizi, censire e riusare ciò che VestiFlow possiede già.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# Appendice D — Fonti normative FatturaPA

- FatturaPA — Specifiche tecniche operative del formato della fattura del Sistema di Interscambio, ver. 1.3.1.

- FatturaPA — Rappresentazione tabellare Fattura ordinaria v1.3.

- Codici verificati al 21/08/2026: CondizioniPagamento TP01–TP03; ModalitaPagamento MP01–MP23.

Durante l’implementazione e prima della messa in produzione, il mapping deve essere riconfermato sulle specifiche ufficiali correnti e validato contro lo schema/XSD realmente usato dal generatore FE di VestiFlow.
