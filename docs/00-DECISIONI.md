# 00 · Le decisioni di VestiFlow — indice unico

**Stato:** indice corrente · creato il 20/08/2026
**A cosa serve:** sapere in dieci secondi che cosa è già deciso, e dove è argomentato.

> **Si parte da qui.** Ogni riga è una decisione **in vigore**, con il puntatore al documento
> che la spiega. Se una specifica dice il contrario di questa pagina, vince la specifica —
> ma allora questa pagina è sbagliata e va corretta subito, non aggirata.

⚠️ **Controllato il 21/08/2026, e non era affidabile.** Il proprietario ha riletto questa
pagina contro le specifiche e ha trovato **sette scarti** — fra cui due decisioni non allineate
allo stato corrente. Sono stati corretti, e la lezione vale più della correzione:

> **Un indice che riassume decisioni invecchia più in fretta dei documenti che indicizza**, e
> invecchia in silenzio. Quando una decisione si restringe, questa pagina va toccata **nello
> stesso passo** — non al prossimo giro.

⛔ **Questo non è un riassunto e non è un archivio.** Non racconta come ci si è arrivati: quello
sta nei documenti, ed è lì che va letto quando serve il perché. Qui c'è solo il **cosa vale
oggi**, perché il difetto misurato il 20/08/2026 era che per saperlo bisognava attraversare la
cronaca — 33.000 righe che crescono di una riga tolta ogni sedici aggiunte.

---

## ⛔ INCOMPATIBILITÀ ATTIVA COL DATABASE CONDIVISO — letta per prima _(26/08/2026)_

> **Il database condiviso ha già il valore `invoice`. Il codice che dice `invoice_draft`
> non è compatibile con quel database.** Non serve che esista una riga del tipo nuovo: basta
> che una query NOMINI il valore vecchio.

⚠️ **Sta qui e non in un documento di merge**, di proposito. `MERGE-QUESTO-RAMO.md` esiste ma
non lo cita nessuno — zero riferimenti in tutto il repository — quindi un avviso scritto lì
sarebbe scritto nel vuoto. Un rischio così deve essere impossibile da mancare, non nascosto
dietro un secondo documento.

### I fatti, misurati il 26/08/2026

|                               |                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chi l’ha cambiato**         | commit `d851e9b9` · migration `20260826003840` · `ALTER TYPE "DocumentType" RENAME VALUE`                                                       |
| **Stato reale del database**  | `pg_enum` dice **`invoice`**. Il valore vecchio **non esiste più**                                                                              |
| **Rami ancora incompatibili** | `origin/main` · `origin/develop` · `origin/feature/cassa` · `origin/feature/pagamenti-tesoriera` — tutti e quattro dichiarano il valore vecchio |
| **Chi è a posto**             | solo il ramo LOCALE, che è 192 commit avanti al proprio remoto                                                                                  |
| **Righe già convertite**      | nessuna: 169 documenti, zero del tipo nuovo                                                                                                     |

### La conseguenza, e perché non serve una riga nuova per subirla

Postgres rifiuta un’etichetta enum che non esiste, anche solo nominata in un confronto:
`invalid input value for enum "DocumentType"`. Su `origin/main`, misurato:

```text
accountant-register-document-counts.util.ts:42,65,70,75   SQL grezzo, cast letterale del valore
documents.service.ts:355                                   type: { in: [...ACCOUNTANT_DOCUMENT_TYPES] }
```

| Endpoint                                     | Stato                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| **Registro commercialista**                  | ⛔ incompatibile sempre: i conteggi sono SQL grezzo col valore cablato |
| **Elenco documenti** con filtro `accountant` | ⛔ incompatibile quando quel filtro è usato                            |
| tutto il resto                               | ✅ non nomina il valore, non se ne accorge                             |

### ⚠️ Da verificare PRIMA di usare o distribuire uno di quei rami

1. **Quel processo punta a questo database?** Se sì, gli endpoint sopra rispondono 500.
2. **Quale commit sta eseguendo davvero?** ⛔ Non è deducibile dal repository: non c’è
   configurazione di deploy committata (solo `api/Dockerfile`), `ci.yml` nomina il deploy
   solo in un commento, e `GET /health` restituisce `{status, database}` — nessuna versione.
   Lo sa solo il cruscotto del fornitore.
3. **L’auto-deploy è attivo sul ramo che segue?** Se non lo è, un push non basta: serve il
   deploy vero.
4. ⛔ **La migration NON va rifatta.** L’enum nel database è già rinominato: ripetere
   `RENAME VALUE` fallisce. Quello che manca è il CODICE, non lo schema.

⛔ **Nessun deploy è implicitamente autorizzato**, e questo non fa eccezione: è una
decisione del proprietario, non una conseguenza tecnica di questa pagina.

### ⛔ E i backup esportati prima del 26/08/2026 non si ripristinano più

Il formato dell’archivio **Backup negozio** è passato da **1 a 3 nello stesso giorno**:
la rinomina del valore di enum, poi `defaultUnitOfMeasure` tolta dallo schema.

⭐ **Il cancello di versione li rifiuta a monte**, con un messaggio che dice cosa è
successo — invece di farli esplodere a metà ripristino su un `Unknown argument` che non
spiega niente. È il meccanismo che esiste apposta, e stavolta ha funzionato.

**Cosa fare**: esportare un backup nuovo. Gli archivi vecchi restano leggibili come file,
ma non sono più ripristinabili su questo schema.

⚠️ Il proprietario ha già dichiarato che non si costruiscono filtri di import per chiavi
obsolete: durante lo sviluppo un archivio si rigenera, e mantenere la compatibilità
costerebbe più di quanto valga.

⚠️ **E la specifica diceva un’altra cosa.** `07-specifica-famiglia-fattura` §«Quando
rinominarlo» prescriveva _«il momento giusto è insieme al merge col ramo del collega,
quando il database smette di avere due storie»_. La rinomina è stata fatta **prima**, il
26/08. La prescrizione è superata dai fatti; la conseguenza è questa pagina.

---

## ⭐ IL CONTRATTO COMUNE viene prima — aggiunto dal proprietario il 22/08/2026

> **`CONTRATTO-COMUNE-DOCUMENTI.md` è il «Blocco 0 canonico»: il contratto normativo
> trasversale di TUTTE le maschere documento a righe.**

⛔ **Non sostituisce le specifiche dei singoli documenti: le governa.** Dove una specifica di
documento contraddice il contratto comune, è la specifica a doversi allineare — e le decisioni
più recenti confermate dal proprietario prevalgono su comportamento osservato, codice attuale e
testi storici incompatibili.

**Che cosa fissa**, in sintesi — l'argomentazione sta nel documento, non qui:

| §   | Materia                                                                  |
| --- | ------------------------------------------------------------------------ |
| 1–2 | perimetro (chi ha vere righe articolo e chi no) e anatomia comune        |
| 3   | **catalogo canonico** di celle e colonne                                 |
| 4   | la **fotografia** del documento: cosa si congela e cosa resta live       |
| 5   | quantità, costi, prezzi, sconti, IVA, **precisione e ordine di calcolo** |
| 6   | giacenza, impegnata, disponibile, le **tre spunte** e i movimenti        |
| 7   | identità della riga, modifica per differenza, idempotenza                |
| 8–9 | tenant, location, **numerazione comune**                                 |
| 10  | desktop, mobile, navigazione, celle di ricerca                           |
| 11  | **Includi e Genera**                                                     |
| 12  | le eccezioni esplicite **da non normalizzare**                           |
| 13  | prestazioni ed errori del salvataggio                                    |
| 14  | i **gap tecnici già individuati**, da non perdere                        |
| 15  | il **metodo** documento-per-documento (16 punti per ciascuno)            |
| 16  | le decisioni **volutamente lasciate aperte**                             |

⭐ **Il principio che regge tutto il contratto**, ed è quello che il proprietario ha ripetuto
più volte durante il lavoro:

> **Stessa cella grafica non significa stesso dato.** Si condividono componenti, grammatica
> visuale, navigazione e meccanismi realmente comuni; **non si fondono regole di dominio
> diverse**. Le differenze si passano alla componente come dati e policy — non come
> `if (documentType…)` sparsi dentro le celle condivise.

⚠️ **§16 elenca ciò che NON si chiude per deduzione** durante l'implementazione: modello dei
Seriali, provenienza riga per Includi/Genera, architettura worker/outbox Shopify, idempotenza
comune della prima creazione, numerazione del Registro Corrispettivi derivato, le parti
incomplete della Fattura elettronica (TD04 compreso), e Rettifica/Inventario.

**Come si procede da qui** (§15): un documento alla volta, confrontato contro il contratto, con
ogni area classificata **conforme · divergente · mancante · legacy**. Prima si chiude la
specifica funzionale, poi si confronta il codice, e solo dopo si prepara l'intervento tecnico.

---

## La mappa: quale documento governa cosa

| Documento                                 | Governa                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| ⭐ **`CONTRATTO-COMUNE-DOCUMENTI`**       | **il contratto trasversale di ogni maschera documento a righe**        |
| `01-registro-difetti-shopify`             | i difetti aperti dell'integrazione Shopify                             |
| `02-specifica-sincronizzazione-shopify`   | come si sincronizza, chi possiede il dato                              |
| `03` + `03b`                              | righe documento unificate, tastiera, U.M., ricerca                     |
| `04-specifica-numerazione-documenti`      | progressivi, serie, anno, indice unico                                 |
| `06b` · `07` · `QUADRO-DECISIONI-FATTURE` | famiglia Fattura (fattura, accompagnatoria, nota di credito)           |
| `08` · `10`                               | resi e annullamenti di canale · Registro Corrispettivi                 |
| `09-specifica-movimenti-per-riga`         | un movimento per riga documento, aggiornato in posto                   |
| `11-specifica-vendita-al-banco`           | Vendita e Reso al banco                                                |
| `12-specifica-collegamenti-documentali`   | «Includi» e «Genera»: **Parte 0 è il contratto** e vince sul resto     |
| `13-specifica-prestazioni-salvataggio`    | prestazioni del salvataggio e pipeline inventario (C4)                 |
| `14-specifica-elenchi-documenti`          | **elenchi e riepiloghi**: apertura, selezione, azioni, tabella         |
| `17-specifica-ordine-fornitore`           | **stati dell’Ordine fornitore**, eleggibilità, Concluso derivato       |
| `18-specifica-ordine-cliente-manuale`     | **stati dell’Ordine cliente manuale**, Impegnata, collegamenti         |
| `19-audit-ordine-cliente-manuale`         | ⛔ **misura congelata** del 28/08, non una specifica: non decide nulla |
| `.claude/rules/regole-*`                  | le regole permanenti: architettura, dominio, stile, sicurezza          |

⚠️ **`PIANO-TEST`, `GUIDA-*`, `DA-FARE*`, `GUARDIE-MANCANTI` non sono specifiche**: sono
strumenti di lavoro. Non ci si cercano decisioni.

---

## Elenchi e riepiloghi — `14`

| Decisione                                                                                                                  | Dove          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Clic sulla riga → Modifica**, per ogni tipo e in ogni elenco. Nessun doppio clic                                         | §2, §3        |
| **Checkbox → selezione**: gesto distinto, non alternativo                                                                  | §4            |
| **Tre funzioni distinte: Modifica · Dettaglio · Stampa/PDF.** «Anteprima» non esiste                                       | §6            |
| Il **Dettaglio** si raggiunge dal suo pulsante e in questa fase non si ridisegna                                           | §E4           |
| **Tre predicati da non confondere**: `canEdit` · `canViewDetail` · `canSelect`                                             | §H16          |
| **Riga selezionata**: cambio di sfondo comune. **Mano**: solo dove il clic apre la Modifica                                | §H16          |
| La **barra azioni è permanente**: la selezione ne cambia l'ambito, non la presenza                                         | §5            |
| **La selezione batte i filtri**: 0 selezionati → il filtrato; 1+ → solo quelle                                             | §5.3          |
| **Stampa · Excel · Esporta** sono tre azioni indipendenti                                                                  | §5.2          |
| **«Esporta» richiede `reports.export`** ovunque sia disponibile                                                            | §E5           |
| **Nessun TETTO di righe a schermo**: un elenco mostra tutto il risultato del filtro e lo si scorre                         | `14` §11.4    |
| **La ricerca globale è fuori perimetro**: è un’anteprima da 5 righe per fonte, non un elenco                               | `14` §11.4    |
| **L’intestazione resta fissa** e le righe scorrono: senza tetto, un elenco è lungo centinaia di schermate                  | `14` §11.5    |
| **Un filtro senza colonna diventa una COLONNA** spenta di serie (Operatore, Controparte, Location)                         | `14` §11.5    |
| **I filtri DERIVANO dalle colonne**: ogni colonna è filtrabile, Periodo e Ricerca restano esterni                          | `14` §0.2     |
| **Il pulsante «Filtri» accende la modalità**, e spegnerlo azzera i filtri di colonna                                       | `14` §0.2     |
| **Colonna spenta = filtro spento**; ma ogni colonna ha il suo filtro, anche quelle spente di serie                         | `14` §0.2     |
| ⛔ **Nei riepiloghi non esce la MAIL di un cliente**, per nessun ripiego                                                   | `14` §11.6    |
| **Il contenitore di scorrimento di una tabella si dichiara col mixin** `table-scroll`, mai a mano                          | stile §6      |
| ⭐ **Un'unica AUTORITÀ strutturale sì; un mega-COMPONENTE universale no**                                                  | `14` §0       |
| **Lo shell fisico è EVENTUALE**: si estrae solo se, applicati i contratti, resta duplicazione reale                        | `14` Fase G   |
| **Il criterio**: residuo geometrico → manca un contratto · residuo strutturale → candidato a shell                         | `14` Fase G   |
| **La guardia cambia bersaglio**: non «pagina fuori dallo shell» ma «seconda implementazione equivalente»                   | `14` §56      |
| ✅ **Il telaio `app-list-page` c'è, e le prende tutte e undici**: testata, zona controlli, stati e sedi sono POSSEDUTI     | `14` §0.7     |
| ⛔ **La zona controlli non è uno slot libero**: la pagina passa valori, non markup                                         | `14` §0.7     |
| ⭐ **Un solo pulsante «Filtri»**, interruttore: acceso mostra i controlli di colonna, spento li AZZERA                     | `14` §0.7     |
| ⛔ **Niente sottotitoli** negli elenchi: il telaio non ha l'input                                                          | `14` §0.7     |
| **Il titolo di pagina è un `<h1>`** e si stila una volta sola: peso `semibold` globale                                     | `14` §0.7     |
| **Lo stato vuoto si uniforma**, Corrispettivi compreso, e non ha CTA                                                       | `14` §0.7     |
| ⛔ **`app-list-filters` non si monta**: il suo contratto è superato, resta utile solo il pannello mobile                   | `14` §0.7     |
| ⭐ **Il pannello filtri sotto `lg` è del TELAIO**, uno per tutti: stesso contenitore, altra veste                          | `14` §0.2     |
| ⛔ **Il contenuto proiettato si rende UNA volta**: due `ng-content` con lo stesso selettore non rendono niente             | `14` §0.2     |
| ⭐ **Ricerca e Periodo restano in barra a ogni larghezza**; Periodo ha lo slot `[period]`                                  | `14` §0.2     |
| ⭐ **Chiudere il pannello NON azzera; su scrivania spegnere «Filtri» SÌ** (ha preso il posto di «Azzera filtri»)           | `14` §0.2     |
| ⛔ **Il telaio SCARTA il contenuto senza slot**, in silenzio: guardia `check:list-page-slots`                              | `14` §0.2     |
| ⏸ **`[overlays]` è una casella PROVVISORIA**: il posto definitivo dei dialoghi è da decidere                               | `14` §0.2     |
| ⭐ **Tutte le funzioni stanno nella barra in basso e NON si nascondono**: a vuoto sono spente col motivo                   | `14` §0.2     |
| ⛔ **Il messaggio è il motivo sull'azione spenta**, non un dialogo dopo il clic                                            | `14` §0.2     |
| ✅ **Prodotti è sulla barra comune**, «Copie per etichetta» compresa: non è un filtro, è un parametro della stampa         | `14` §0.2     |
| ⭐ **Due fasce in fondo**: TOTALI sopra, COMANDI sotto — e la riga comandi non si muove mai                                | `14` §0.2     |
| ⛔ **La riga totali non sparisce**: senza selezione mostra il filtrato, con selezione la selezione                         | `14` §0.2     |
| ⭐ **Si somma ciò che è VISIBILE**: colonna spenta, totale assente — una decisione sola                                    | `14` §0.2     |
| ⛔ **`summable` è un opt-out** su `numeric`: si dichiara chi NON si somma (percentuali, unitari)                           | `14` §0.2     |
| ⛔ **Via l’indicatore di selezione dalla barra**: «N voci» dei totali è già il conteggio                                   | `14` §0.2     |
| ⭐ **Il selettore Colonne serve su OGNI elenco**: senza, non si scelgono né dati né totali                                 | `14` §0.2     |
| ⛔ **Il menu tre-puntini di riga sparisce**: Duplica, Etichette e Allegati vanno nella barra                               | `14` §0.2     |
| ⭐ **La FORMA dei comandi sta in un catalogo**, la pagina passa solo il gestore                                            | `14` §0.2     |
| ⭐ **«Esporta» è il menu dei tracciati** (PDF · CSV · XML); Stampa ed Excel restano comandi                                | `14` §0.2     |
| ⚠️ **I quattro pulsanti Shopify NON si unificano**: sono operazioni diverse con lo stesso id                               | `01` §L5      |
| ⭐ **Su Corrispettivi vince il RIEPILOGO**, non la riga totali: metà delle sue voci non sono colonne                       | stile §totali |
| ⭐ **All'operatore si dice «Sede»**; `location` resta il nome del modello                                                  | `14` §15      |
| ⭐ **Le colonne di elenco stanno in un catalogo**; le etichette fisse le rifiuta il compilatore                            | `14` §0.2     |
| ⛔ **Vendite online non si ordina**: l'API non ha `sort`, e ordinare la pagina corrente mentirebbe                         | `14` §0.2     |
| ⭐ **«Nuovo ordine fornitore» PROPONE**: apre un ordine nuovo precompilato, non lo crea                                    | `14` §0.2     |
| ⭐ **Il precompilato porta gli id**, non i valori: le righe passano dal risolutore comune                                  | `14` §0.2     |
| ⛔ **Il fornitore non si propone più in automatico** dagli articoli; quello nuovo si crea e resta                          | `14` §0.2     |
| ⛔ **Digitare in una riga NON rilegge il catalogo**: `distinctUntilChanged` sui contenuti degli id                         | `14` §0.2     |
| ⏸ **Il catalogo si interroga un articolo alla volta**: un `variantIds[]` porterebbe l'apertura da 2N a 2                   | `14` §0.2     |
| **Ordinamento**: `DataTableSort[]` è l'unica grammatica, il parametro HTTP la sua serializzazione                          | §H15          |
| **Corrispettivi**: con «Raggruppa: Giorno» niente sorting manuale, con «Nessuno» il sorting comune. I filtri sempre attivi | `10` §20      |
| **La grammatica visiva**: 12px · 4×12 · intestazione 32px MAIUSCOLA · niente divisori di colonna                           | §F6           |
| **Si conserva** il preset e le colonne visibili; **non** la larghezza né l'ordine                                          | §G1           |

## Documenti e righe — `03`, `03c`, `03d`, `09`, `12`

| Decisione                                                                                                                                    | Dove                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Una riga che movimenta ha UN movimento**, identificato da `sourceLineId`, aggiornato in posto                                              | `09` · regole               |
| **La riga è una fotografia**: un valore non modificato conserva quello persistito                                                            | regole                      |
| Lo **Vendita manuale** non crea movimenti — deroga esplicita, non un precedente                                                              | regole                      |
| ⭐ **La Vendita manuale si accende, e la accende il TITOLARE**: nasce spenta; governa creazione e modifica, non l’eliminazione               | `SOLO-GESTIONALE` §10.6-bis |
| ⭐ **L'Ordine cliente è il riferimento MOBILE** di tutti i documenti a righe articolo: una sola struttura comune, mai una card per documento | `03d` §1                    |
| ⭐ **Prima la convergenza strutturale, le differenze alla fine** — e si esprimono come configurazione, mai come seconda implementazione      | `03d` §2, §12               |
| **Una maschera entra nel sistema comune UNA volta**, per tutte le responsabilità comuni insieme                                              | `03d` §11                   |
| **Il titolo è uno, la variante sta in `variantLabel`**: mai concatenata dentro la descrizione                                                | `03d` §6 · Blocco 0 §3.2    |
| **Un solo risolutore** per «l'articolo entra nella riga»; acquisizione, `FormControl` e anagrafica restano fuori                             | `03c`                       |
| **Impegna, Carica e Scarica** condividono la regola di eleggibilità, **non** campo, default, effetto e significato                           | `03d` §4 · `03` §18.4       |

## Stati — documenti e ordini — `17`, `18` _(decise il 27-28/08/2026)_

⭐ **Uno stato d'ordine decide UNA cosa sola: se l'ordine è includibile in un documento
di destinazione.** Non decide se si apre, se si modifica, se si salva, se si stampa, se
si elimina, né come si comporta il lucchetto. Vale per entrambi gli ordini.

| Decisione                                                                                                         | Dove          |
| ----------------------------------------------------------------------------------------------------------------- | ------------- |
| **Quattro stati**: Da confermare · Confermato · Concluso · Annullato                                              | `17` §2.1     |
| Lo stato governa **solo l'eleggibilità** in Includi/Genera                                                        | `17` §2.2     |
| **Eleggibile è il solo Confermato.** Da confermare, Concluso e Annullato no                                       | `17` §4       |
| **Il documento nasce Confermato.** «Da confermare» lo imposta l'operatore                                         | `17` §2.3-2.4 |
| **«Annullato» è uno STATO, non un comando — e si torna indietro.** Nessun punto di non ritorno                    | `17` §2.6     |
| **«Concluso» è derivato** dal collegamento, mai scelto. Si disfa da sé togliendo il legame                        | `17` §2.5     |
| Finché è Concluso lo **stato** è bloccato: nessuna transizione manuale, annullamento compreso                     | `17` §2.5     |
| ⭐ Ma il **documento** resta libero: si elimina, e l'Arrivo merce **sopravvive orfano** (`SetNull`, già a schema) | `17` §5.3     |
| **Niente stato parziale.** Né «Parzialmente concluso», né residui, né evasione parziale in v1                     | `17` §2.7     |
| L'Ordine fornitore **non muove magazzino in nessuno stato**. «In arrivo» è fuori perimetro v1                     | `17` §1, §1.1 |

### ⭐ DUE ASSI DIVERSI, e confonderli è l'equivoco che questa sezione previene

⛔ **«Da confermare» NON è la nuova Bozza.** L'associazione è la prima che verrà in mente fra
un mese, ed è sbagliata: sono due assi che non si toccano.

```text
ASSE 1 · PERSISTENZA          ogni documento
  non salvato   →  non esiste
  salvato       →  Confermato          ← stato interno operativo

ASSE 2 · CICLO COMMERCIALE    solo Ordine cliente e Ordine fornitore
  salvato       →  Da confermare  ·  Confermato  ·  Annullato
  Confermato    →  Includi/Genera conclusivo  →  Concluso, e lì si blocca
```

|                          | Asse 1 — persistenza | Asse 2 — ciclo commerciale     |
| ------------------------ | -------------------- | ------------------------------ |
| **Chi ce l'ha**          | ogni documento       | solo i due ordini              |
| **Che domanda risponde** | «esiste?»            | «è pronto per essere incluso?» |
| **Chi lo governa**       | il salvataggio       | l'operatore, salvo Concluso    |
| **Se manca**             | il documento non c'è | —                              |

⭐ **Un Ordine «Da confermare» è un documento GIÀ SALVATO E GIÀ NUMERATO.** Non aspetta il
passaggio a Confermato per nascere: è nato al Salva, come ogni altro documento. «Da confermare»
descrive dove sta nella **trattativa commerciale**, non se esiste.

⚠️ **Questo ha una conseguenza diretta sulla numerazione** (`04`): il progressivo si assegna al
salvataggio, non alla conferma commerciale. Un ordine Da confermare ha già il suo numero, e non
lo cambia passando a Confermato.

⚠️ **«Confermato» compare su entrambi gli assi con significati diversi**, ed è il punto in cui
si sbaglia: su un Preventivo vuol dire «salvato»; su un Ordine cliente vuol dire «salvato **e**
pronto per l'Includi». Se un giorno la sovrapposizione costasse un errore vero, i nomi dell'asse
2 si possono cambiare — sono etichette di prodotto, non valori di database.

#### ⛔ I due assi restano separati anche TECNICAMENTE, non solo spiegati qui

> **Quando arriverà «Da confermare», il sistema non deve rappresentare i due assi con lo stesso
> campo o lo stesso enum.** Sono due domande diverse e vogliono due colonne diverse.

```text
documento persistito?      sì / no
stato commerciale ordine?  da_confermare | confermato | concluso | annullato
```

Un Ordine «Da confermare» è **contemporaneamente**:

|              |                   |
| ------------ | ----------------- |
| persistito   | **sì**            |
| numerato     | **sì**            |
| stato ordine | **Da confermare** |

⛔ **Non deve essere necessario falsificare `DocumentStatus`, né riportarlo a `draft`, per
rappresentarlo.** Se per esprimere «Da confermare» si finisse per rimettere il documento in
bozza, si sarebbe reintrodotta la Bozza sotto un altro nome — dopo averla abolita.

⚠️ **Questo vincola la migration** (punto 6 del piano): la soluzione tecnica dello stato Ordine
va progettata come **stato commerciale dell'ordine**, non come reincarnazione della vecchia
Bozza documento. È il criterio con cui giudicare la proposta, prima ancora di guardare se
funziona.

### ⛔ «Confermato» NON vuol dire «movimenta magazzino»

> **Vuol dire documento salvato.** Gli effetti fisici li decide il **tipo** del documento e il
> contratto delle sue righe — mai il valore generico dello stato.

```text
Salva  →  nasce il documento
       →  numero assegnato
       →  stato interno operativo = Confermato
       →  gli effetti dipendono DAL TIPO

Arrivo merce            →  Confermato + carichi delle righe abilitate
DDT                     →  Confermato + scarichi pertinenti
Proforma                →  Confermato,  nessun movimento: il tipo non movimenta
Registrazione fattura   →  Confermato,  nessun movimento: il tipo non movimenta
```

⚠️ **La vecchia equazione «Bozza = niente movimenti / Confermato = movimenti» cade insieme alla
Bozza**, ed è quella che faceva sembrare necessario un doppio passaggio Salva → Conferma.

⛔ **Per l'Arrivo merce la direzione era già fissata da tempo**: niente «Salva bozza» e
«Conferma carico» separati, e niente badge «Bozza» — il codice lo applica già per i tipi
operativi (`domain/documents/models/document-operational.util.ts`). **Il Salva salva e applica
gli effetti previsti dalle righe**, in un gesto solo.

⭐ **E «Confermato» non obbliga a mostrare niente.** Lo stato può restare **tecnico e interno**
quando il tipo non ha un ciclo di stato che riguardi l'operatore: un Preventivo è un documento
salvato e operativo senza bisogno di un selettore o di un badge. ⛔ Non si aggiunge interfaccia
solo perché il record internamente è confermato.

⭐ **E «Bozza» non esiste — né sui documenti né sugli ordini.** Un documento **nasce
Confermato**, col numero assegnato al salvataggio: non c’è uno stato intermedio in cui esiste
ma non conta. È la **nascita-confermato**, che il progetto già nominava
(`SPECIFICA-COMUNE-TESTATE-DOCUMENTO` §1320) e che l’Ordine cliente applica già.

⛔ **Non esiste «Parzialmente concluso»**, in nessuna forma: né stato, né residuo, né evasione
parziale. Un documento di destinazione che copre parte delle quantità **conclude comunque**
l’ordine. L’endpoint `force-conclude` serve un workflow abolito ed è destinato a sparire.

### ⭐ La gerarchia fra norma e codice, che non si capovolge

> **La definizione normativa degli stati e delle transizioni è il CONTRATTO APPROVATO.**
> `api/src/common/order-state.util.ts` è l’unica autorità **eseguibile** del codice per la
> macchina comune, e i consumer non devono riscriverne le regole. **Se codice e specifica
> approvata divergono, la divergenza è un difetto da correggere, non una regola nuova.**

```text
NORMA                       docs/00 + specifica approvata
        ↓
IMPLEMENTAZIONE CANONICA    order-state.util.ts
        ↓
CONSUMER                    Ordine cliente · Ordine fornitore · Includi/Genera
```

⛔ **Non l’inverso.** «Il codice attuale decide cosa il prodotto deve fare» è la lettura da
impedire, e oggi si smentisce da sé: il codice non sa ancora produrre `to_confirm`, l’Ordine
cliente non usa ancora la macchina comune, e porta ancora il workflow legacy del parziale.

⚠️ **Il codice è indietro su tutto questo, e i documenti lo dichiarano.** Mancano «Da
confermare» e il selettore di stato; l’annullamento è un comando a senso unico; due guardie
bloccano modifica ed eliminazione per stato; `DocumentStatus.draft` esiste ancora nello schema;
`PartiallyConcluded` e `partially_fulfilled` sono vivi con il loro endpoint e il loro dialogo.
`17` §2.2/§2.6/§5.3 e `19` misurano lo scarto. **Le decisioni valgono; l’allineamento è lavoro.**

⛔ **E `DocumentStatus.draft` NON si cancella dal codice così com’è.** «Bozza» è abolita come
**stato funzionale**, ma quel valore ha **consumatori reali già misurati** — governa modifica
libera, anteprima del numero ed eliminazione, con nove usi nel solo `documents.service.ts`.
La documentazione indica la **destinazione**; il codice si bonifica in modo **coordinato**,
dentro il blocco di implementazione, non con una cancellazione.

---

## Denaro — `regole-gestionale`

| Decisione                                                                                |
| ---------------------------------------------------------------------------------------- |
| Prezzi e costi **unitari** sono `NUMERIC(16,6)`; totali e imposte sono interi            |
| Si **arrotonda solo all'uscita**; «è cambiato?» si chiede al centesimo                   |
| Netto/ivato: **convenzione aziendale → memoria dell'operatore → modalità del documento** |
| In anagrafica il selettore governa **sei** campi, barrato compreso; il costo resta netto |

## Vendita al banco — `11`

| Decisione                                                                                                                                                                | Dove       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Due tasti diretti alla creazione: **Nuova vendita** e **Nuovo reso**, nessun selettore dentro                                                                            | A2 · A3    |
| **Ordine cliente è il riferimento della MASCHERA** «Nuovo ordine cliente» — il form operativo, mobile compreso. ⛔ **Non** del riepilogo, che segue la grammatica comune | A12 · `03` |
| ✅ **L'elenco Vendita/Reso ESISTE già** (profilo `store-sale`, sul motore comune): non si ricostruisce. La fase che segue è **solo la maschera**                         | A11-quater |
| **Vendita e Reso al banco sono MODIFICABILI** anche dopo la conclusione: si riaprono, si correggono, si risalvano e si eliminano, con gli effetti riallineati            | A2         |
| «Vendita negozio» è **legacy**: il nome è «Vendita al banco»                                                                                                             | A6         |

---

## Anagrafica e impostazioni — `SOLO-GESTIONALE`, `03b`

| Decisione                                                                                                       | Dove                               |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| ⭐ **Un solo elenco di unità di misura**, quello dell’azienda: righe documento e anagrafica leggono lo stesso   | `SOLO-GESTIONALE` §16.1 · `03b` §5 |
| **La predefinita precompila un articolo NUOVO** — anche creato in linea — e nient’altro                         | `SOLO-GESTIONALE` §16.1            |
| ⛔ **Non sostituisce il default della riga documento**, che viene dall’articolo                                 | `SOLO-GESTIONALE` §16.1            |
| **Vuota è legittima**: zero o una per azienda, garantito da indice unico parziale                               | `03b` §5                           |
| ⛔ **Rinominare o eliminare una voce non riscrive articoli né documenti**: l’unità è testo sulla riga, senza FK | `03b` §5                           |

## ⏸ Le decisioni APERTE — in un posto solo

⛔ **Nessuna di queste si chiude scrivendo codice che funziona.** Si chiudono decidendo.

| Aperta                                                                                               | Dove               |
| ---------------------------------------------------------------------------------------------------- | ------------------ |
| **Controparte** (elenco documenti) ordinabile — serve una fonte sola per il dato                     | `14` §H15          |
| **Stato** (ordini cliente) ordinabile — si riprende col modulo Ordine cliente                        | `14` §H15          |
| **«Non modificabile ⇒ non selezionabile»** — applicazione da chiudere con le azioni                  | `14` §H16          |
| **Dettaglio dell'Ordine cliente** — gap, col rifacimento dei Detail                                  | `14` §E6           |
| **Dettaglio del Corrispettivo manuale** — oggi ha solo la modifica                                   | `14` §E6           |
| **Policy delle azioni massive**: selezione eterogenea ed esiti parziali (⚠️ l'ambito è deciso, §5.3) | `14` §E5           |
| **Stampa/PDF** come menu per tipo documento                                                          | `14` §E2           |
| **Giacenze e Situazione**: in pausa                                                                  | `14` §C0.0         |
| **Corrispettivi nel motore tabella**: fermi, e non per pigrizia                                      | `14` §H14          |
| **Riga manuale** senza articolo in anagrafica                                                        | `11` A21           |
| **Header di sicurezza** del documento HTML — lacuna aperta                                           | `regole-sicurezza` |

---

## ⛔ Filtrare non è autorizzare — principio trasversale _(28/08/2026)_

```text
query / elenco filtrato        =  ERGONOMIA
validazione dell’ID richiesto  =  AUTORIZZAZIONE
```

> **Un utente non deve poter scavalcare l’ambito di sede semplicemente conoscendo un ID.**

⚠️ Un elenco che mostra meno righe è comodità: non impedisce niente a chi chiede per `id`. Il
controllo vive nel livello che possiede davvero **tenant + sede + utente** — non nella UI, non
nella `where` dell’elenco.

⛔ **Vale per tutte le rotte, non solo per quelle che «sembrano» sensibili**: lettura diretta
per ID, download e upload di allegati, eliminazione, e ogni lettura collegata.

⚠️ **Lacuna aperta e misurata:** `19` §3.9 conta **sette rotte** dell’Ordine cliente che
accedono per `id` senza verificare la sede. `assertLocationReadableInUserScope` esiste ed è il
predicato giusto. Vedi anche `12` §0.8.

---

## Il metodo, in quattro righe

1. **La decisione più recente prevale** su documenti precedenti, codice e comportamento
   attuale. Una limitazione dell'implementazione **non riapre** un requisito deciso: si
   dichiara come gap e si adegua il codice (`14` §H13).
2. **Si misura prima di concludere**, e la misura porta la data. «Dedotto» non è «misurato».
3. **Il testo superato non resta come requisito** — ma i rimedi sono **due**, e scambiarli
   costa in due modi opposti:
   - **cronaca, ripetizioni, il ragionamento che portava a una decisione vecchia** → si
     **cancella** (`regole-qualita`, «Testo morto nelle specifiche»). È ciò che costringe a
     rileggere duemila righe per sapere che cosa vale oggi.
   - **una regola incompatibile che qualcuno potrebbe ancora applicare come requisito** → si
     **marca** `⛔ SUPERATO — NON USARE COME REQUISITO`, col puntatore alla sezione vigente
     che la sostituisce _(deciso dal proprietario il 22/08/2026)_. ⚠️ Cancellarla non impedisce
     a chi la ricorda di riproporla: **la marcatura è la guardia**, e cancellare la toglierebbe.
4. **Lint, build e test dicono che compila, non come si vede.** La verifica visiva è un passo
   a sé, e non la fa il codice (`14` §H14).
