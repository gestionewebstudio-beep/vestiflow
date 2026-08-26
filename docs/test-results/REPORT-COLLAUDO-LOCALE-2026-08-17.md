# Collaudo end-to-end VestiFlow — istanza locale

|              |                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Data**     | 17 agosto 2026                                                                                                                                                                                               |
| **Istanza**  | `http://localhost:4200` (frontend `ng serve`) → `http://localhost:3000/api/v1` (API locale)                                                                                                                  |
| **Database** | Supabase **condiviso** — non un DB locale: le scritture toccano dati veri                                                                                                                                    |
| **Branch**   | `develop` @ `f774a3a`                                                                                                                                                                                        |
| **Account**  | Titolare `test@sologestionale.it`                                                                                                                                                                            |
| **Metodo**   | 20 agenti in pipeline su 10 aree funzionali: ognuna testata da un agente che ha scritto ed eseguito i propri spec Playwright, poi passata a un verificatore adversariale incaricato di _refutarne_ i difetti |
| **Volume**   | 23 file di spec, ~1.900 esecuzioni di strumenti, 207 screenshot, 1h54m                                                                                                                                       |
| **Esito**    | **56 difetti** — 3 P1 · 25 P2 · 28 P3                                                                                                                                                                        |

Gli spec sono in `e2e-local/`, gli screenshot in `docs/test-results/screenshots-local/`.
Il codice dell'applicazione non è stato modificato.

> **Nota del 26/08/2026 — è una rinomina, non una revisione del collaudo.** Il documento
> che quel giorno si chiamava «Scarico manuale giacenze» oggi si chiama **Vendita manuale**:
> è una vendita registrata a mano, che riduce la giacenza senza generare movimenti. Qui
> sotto è stato aggiornato il **nome**, perché è quello che si cerca oggi — ma le schermate
> del 17/08 dicevano ancora il nome vecchio. Nessun esito, nessuna misura e nessuna
> osservazione sono stati toccati.

---

## Avvertenza sul metodo

**Tutti e 56 i difetti risultano «confermati» dalla verifica adversariale. Un tasso del
100% va preso con sospetto**: o i verificatori sono stati indulgenti, o i tester avevano già
scartato in proprio i falsi positivi (era richiesto: rieseguire ogni fallimento prima di
riportarlo). Non ho modo di distinguere i due casi a posteriori.

Per questo **ho verificato personalmente i tre P1**, in modo indipendente dagli agenti:

| P1                         | Come l'ho verificato                                                         | Esito          |
| -------------------------- | ---------------------------------------------------------------------------- | -------------- |
| Chiusura inventario        | Lettura del codice backend: la catena di chiamate è deterministica           | **confermato** |
| Reso multiplo in cassa     | Lettura del codice backend: la query di controllo non legge le quantità rese | **confermato** |
| Ricerca registro documenti | Test dal vivo in sola lettura                                                | **confermato** |

I P2 e P3 poggiano invece sulla verifica degli agenti: **trattali come segnalazioni attendibili
ma non come fatti accertati**, soprattutto quelli su cui deciderai di intervenire.

---

## I tre difetti bloccanti

### P1.1 — La chiusura dell'inventario fisico fallisce _dopo_ aver applicato le rettifiche

Il difetto peggiore del giro, perché l'operazione **è irreversibile e riesce a metà**: le giacenze
vengono aggiornate, i movimenti scritti, il documento `INV-…` creato e confermato — poi la
richiesta risponde **409** e la schermata resta su «In revisione», col pulsante «Applica
rettifiche» ancora lì. Chi lo preme di nuovo riceve un secondo errore, diverso.

La causa è nel codice, e non lascia margini:

```ts
// api/src/inventory/inventory-count.service.ts:345
const draft = await this.documents.create(...);              // ← ritorna GIÀ confermato
const confirmed = await this.documents.confirm(tenantId, draft.id, user);   // ← 409
```

`documents.create()` termina con `return this.confirmDocumentTx(...)` (`documents.service.ts:1135`):
dalla **Fase 3 «via le bozze»** i documenti nascono confermati. Ma `inventory-count.service.ts`
è rimasto al mondo di prima — la variabile si chiama ancora `draft` — e richiama `confirm()`
su un documento che bozza non è più. `confirmDocumentTx` rifiuta a `documents.service.ts:2285`:
«Solo i documenti in bozza possono essere confermati.»

Ne discende anche un P2 riportato separatamente: `documentId` viene salvato sulla sessione
_dopo_ la `confirm()` che esplode, quindi resta `null` e il link «Apri documento inventario
generato →» non compare mai.

Aggravante: la chiamata impiega 6–15 s a fronte di un timeout HTTP di 15 s lato frontend
(`inventory.service.ts`). In una misura su tre la richiesta viene annullata dal client e
l'operatore non vede **nemmeno** il messaggio d'errore.

### P1.2 — La stessa vendita si può rendere infinite volte: la giacenza cresce oltre il venduto

Venduto 1 pezzo, reso 1 pezzo, reso **di nuovo** lo stesso pezzo: due documenti di reso
accettati (201) e la giacenza sale a +1 rispetto a prima della vendita. Riprodotto due volte
su un articolo con giacenza di partenza nota.

Il controllo sulla vendita di origine legge solo il numero:

```ts
// api/src/store-sales/store-sales.service.ts:265
const sale = await this.prisma.document.findFirst({
  where: { id: dto.saleDocumentId, tenantId, type: DocumentType.store_sale },
  select: { reference: true }, // ← solo il numero: nessuna quantità già resa
});
```

Non esiste alcun concetto di residuo rendibile — né lato API né lato UI: `listRecentSales` non
espone un campo di quantità già resa, quindi nemmeno la cassa potrebbe avvisare. Dopo il primo
reso la vendita ricompare nella ricerca con «Venduta 1» e il campo «Da rendere» di nuovo
compilabile, senza alcuna traccia del reso precedente.

È il difetto con la conseguenza economica più diretta: un reso ripetuto (per errore o
deliberatamente) gonfia il magazzino e falsa i corrispettivi.

### P1.3 — La ricerca libera del Registro documenti non fa nulla

Campo «Cerca per numero, controparte o documento esterno…»: si digita, si preme Invio, e
**non accade niente**. Verificato dal vivo:

```
righe prima=20  dopo=20
URL prima = /app/documents/registro   dopo = /app/documents/registro
chiamate API dopo la ricerca: 0
```

Nessuna chiamata parte, l'URL non cambia, la lista non si muove. Su un registro documenti è
la funzione che si usa per prima.

---

## Tutti i difetti

| #   | Gravità | Tipo                      | Area                  | Difetto                                                                                                                                                               |
| --- | ------- | ------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **P1**  | bug                       | Movimenti             | Chiusura inventario fisico: le rettifiche vengono applicate ma «Applica rettifiche» risponde 409 e la schermata resta «In revisione»                                  |
| 2   | **P1**  | bug                       | Vendita al banco      | Cassa: la stessa vendita si può rendere più volte — la giacenza cresce oltre il venduto                                                                               |
| 3   | **P1**  | bug                       | Documenti             | La ricerca libera del Registro documenti non filtra nulla: nessuna chiamata API, URL invariato, lista invariata                                                       |
| 4   | **P2**  | bug                       | Autenticazione, shell | Recupero password: l'errore mostrato è quello del login («Email o password non corretti.») oppure il testo grezzo inglese di Supabase                                 |
| 5   | **P2**  | bug                       | Autenticazione, shell | /login/reset-password senza alcun token: con una sessione attiva mostra il form «Nuova password» e permette di reimpostare la password senza conoscere quella attuale |
| 6   | **P2**  | a11y                      | Autenticazione, shell | Contrasto sotto la soglia AA nella topbar (ricerca globale e kbd ⌘K) su OGNI pagina della shell: axe segnala color-contrast serious ovunque                           |
| 7   | **P2**  | a11y                      | Autenticazione, shell | Due input file senza etichetta in /app/settings: axe segnala «label» di impatto critical                                                                              |
| 8   | **P2**  | bug                       | Prodotti: lista       | L'ordinamento delle colonne della lista prodotti non ha alcun effetto: sort/order non arrivano mai all'API                                                            |
| 9   | **P2**  | dato-incoerente           | Prodotti: lista       | La colonna «Varianti» della lista mostra 0 su articoli che hanno varianti (conta le combinazioni di opzioni, non le varianti)                                         |
| 10  | **P2**  | bug                       | Magazzino: giacenze   | Il filtro Stato stock (Disponibile/Esaurito) è applicato solo alla pagina già caricata: la paginazione continua a dichiarare il totale non filtrato                   |
| 11  | **P2**  | dato-incoerente           | Magazzino: giacenze   | Le rettifiche generate dall'import CSV giacenze non registrano chi le ha eseguite                                                                                     |
| 12  | **P2**  | bug                       | Prodotti: creazione   | Tab Varianti: il prezzo di vendita per variante è mostrato con 14 decimali (40,90163934426229)                                                                        |
| 13  | **P2**  | dato-incoerente           | Prodotti: creazione   | «Prezzo di vendita» vale ivato nel tab Articolo e netto nel tab Varianti, stessa maschera e nessun selettore                                                          |
| 14  | **P2**  | bug                       | Prodotti: creazione   | SKU/EAN già in uso: l'errore compare live ma «Crea prodotto» resta premibile — il blocco arriva solo dal server (409)                                                 |
| 15  | **P2**  | dato-incoerente           | Prodotti: creazione   | Il dettaglio prodotto mostra i prezzi NETTI mentre la maschera li mostra IVATI — e il prezzo barrato, lì accanto, è ivato                                             |
| 16  | **P2**  | bug                       | Dashboard, Report     | Il redirect da /app/reports/corrispettivi[/print] scarta TUTTI i query param: la stampa per il commercialista esce con un altro periodo                               |
| 17  | **P2**  | bug                       | Dashboard, Report     | Il periodo dei grafici, dichiarato «indipendente», viene azzerato ogni volta che si cambia il periodo dei KPI                                                         |
| 18  | **P2**  | ux                        | Dashboard, Report     | Senza il permesso «Esportare dati» la pagina Report perde l'unico selettore di periodo dei KPI: la Performance commerciale resta inchiodata a 30 giorni               |
| 19  | **P2**  | bug                       | Movimenti             | Il documento Inventario viene creato e confermato ma non viene mai collegato alla sessione: il link «Apri documento inventario generato →» non compare mai            |
| 20  | **P2**  | dato-incoerente           | Movimenti             | La rettifica generata dalla chiusura inventario è attribuita a «Automatico», non all'operatore che l'ha applicata                                                     |
| 21  | **P2**  | divergenza-documentazione | Movimenti             | I filtri della lista Movimenti non vivono nell'URL: ricaricare la pagina li azzera tutti                                                                              |
| 22  | **P2**  | bug                       | Clienti, impostazioni | L'automatismo «Inserisci nota nei documenti» del cliente non arriva su Ordine cliente, DDT vendita e Preventivo                                                       |
| 23  | **P2**  | bug                       | Vendita al banco      | Ordine cliente: se si salva prima che arrivi la scheda articolo, il controllo di disponibilità non scatta e l'ordine impegna comunque                                 |
| 24  | **P2**  | bug                       | Fornitori             | Ricezione parziale: ricevuti 2 di 4, l'ordine si chiude e i 2 pezzi residui non sono più ricevibili da nessun percorso                                                |
| 25  | **P2**  | bug                       | Fornitori             | Allegati dell'ordine fornitore: il pannello va sempre in errore — il frontend chiama /sales-orders/:id/attachments e l'endpoint per gli ordini fornitore non esiste   |
| 26  | **P2**  | bug                       | Fornitori             | Il pulsante «Includi ordine» non compare mai su un nuovo Arrivo merce: il flusso (b) di §9.1 è irraggiungibile                                                        |
| 27  | **P2**  | bug                       | Fornitori             | Arrivo merce creato da ordine: la riga importata porta lo SKU al posto del nome articolo (in «Nome prodotto» e in «Descrizione»)                                      |
| 28  | **P2**  | dato-incoerente           | Documenti             | Il «Riepilogo IVA» dell'arrivo merce ignora lo sconto documento e contraddice l'IVA mostrata a fianco                                                                 |
| 29  | **P3**  | ux                        | Autenticazione, shell | /cambia-password è aperta a chi non deve cambiare la password: schermata fuori dalla shell, senza via d'uscita e con un testo che dice il falso                       |
| 30  | **P3**  | ux                        | Autenticazione, shell | La scorciatoia in topbar mostra «⌘K» anche su Windows, dove il comando è Ctrl+K                                                                                       |
| 31  | **P3**  | divergenza-documentazione | Autenticazione, shell | La sidebar non ha la voce «Ordini Fornitori» richiesta dalle regole di dominio                                                                                        |
| 32  | **P3**  | ux                        | Autenticazione, shell | Il breadcrumb del dettaglio prodotto dice «Dettaglio» invece del nome del prodotto, benché il meccanismo per farlo esista                                             |
| 33  | **P3**  | ux                        | Prodotti: lista       | Se il salvataggio delle preferenze colonne fallisce, nessun avviso: la scelta resta a schermo e sparisce al reload successivo                                         |
| 34  | **P3**  | bug                       | Prodotti: lista       | L'export CSV del catalogo non ha la colonna costo: il round-trip export→import azzera i costi d'acquisto                                                              |
| 35  | **P3**  | a11y                      | Prodotti: lista       | Contrasto sotto AA nell'intestazione della tabella prodotti (4.31:1) e nei testi della pagina Import (3.04:1): il token --color-table-header-fg non viene usato       |
| 36  | **P3**  | a11y                      | Prodotti: lista       | Il pannello «Colonne» è un role="dialog" che non si chiude con Esc e non intrappola il fuoco                                                                          |
| 37  | **P3**  | bug                       | Magazzino: giacenze   | Il filtro «Sotto soglia» non elenca articoli sotto soglia: restituisce solo gli Esauriti                                                                              |
| 38  | **P3**  | ux                        | Magazzino: giacenze   | In Giacenze l'ordine alfabetico riparte da capo a ogni pagina                                                                                                         |
| 39  | **P3**  | divergenza-documentazione | Magazzino: giacenze   | I filtri di Giacenze non vivono nell'URL: ricaricando la pagina si perdono (doc §20.10)                                                                               |
| 40  | **P3**  | ux                        | Prodotti: creazione   | Il messaggio di SKU/EAN duplicato non nomina il record in conflitto, mentre quello del codice articolo lo fa                                                          |
| 41  | **P3**  | divergenza-documentazione | Dashboard, Report     | «Registro commercialista» (/app/reports/accountant-register) è ancora documentato ma non esiste: l'indirizzo cade in Dashboard senza dire niente                      |
| 42  | **P3**  | ux                        | Dashboard, Report     | Separatore delle migliaia incoerente: nella stessa fila di KPI convivono «5625,00 €» e «13.410,00 €»                                                                  |
| 43  | **P3**  | ux                        | Dashboard, Report     | Il periodo scelto sulla Dashboard non entra nell'URL e si perde a ogni ricarica (sul Report invece è persistito)                                                      |
| 44  | **P3**  | bug                       | Dashboard, Report     | La Dashboard chiama /dashboard/summary due volte a ogni apertura (una prima che la location attiva sia nota)                                                          |
| 45  | **P3**  | ux                        | Movimenti             | Il riepilogo di conferma di un movimento non dice quantità né impatto atteso, nemmeno quando la giacenza andrà sotto zero                                             |
| 46  | **P3**  | a11y                      | Movimenti             | Il dialogo di conferma del movimento viene annunciato agli screen reader col titolo del dialogo di logout (id DOM duplicato)                                          |
| 47  | **P3**  | ux                        | Movimenti             | Con una sola location il pulsante «Trasferimento» porta a un form che non può mai essere salvato                                                                      |
| 48  | **P3**  | divergenza-documentazione | Clienti, impostazioni | Il pannello «Magazzino e documenti» annuncia una «policy di aggiornamento prezzo fornitore» che non esiste in nessuna impostazione                                    |
| 49  | **P3**  | bug                       | Clienti, impostazioni | La shell chiede le sedi a ogni navigazione anche a chi non ha la sezione Magazzino: 403 ripetuti su GET /inventory/locations                                          |
| 50  | **P3**  | divergenza-documentazione | Vendita al banco      | Vendita al banco oltre la disponibile: la documentazione dice «rifiutata», la cassa la accetta e manda la giacenza in negativo                                        |
| 51  | **P3**  | bug                       | Fornitori             | P. IVA fornitore senza alcuna validazione: «123» viene accettata e salvata                                                                                            |
| 52  | **P3**  | ux                        | Fornitori             | Arrivo merce creato da ordine: la tabella nasce con una riga vuota in testa, prima delle righe dell'ordine                                                            |
| 53  | **P3**  | divergenza-documentazione | Fornitori             | Lista Ordini fornitori: i filtri «fornitore» e «periodo» promessi da §9.2 non esistono                                                                                |
| 54  | **P3**  | divergenza-documentazione | Fornitori             | PIANO-TEST §12 descrive un flusso ordine fornitore che non esiste più (Invia ordine, Parzialmente ricevuto, colonna «In arrivo»)                                      |
| 55  | **P3**  | bug                       | Documenti             | DELETE /api/v1/products/:id risponde 500 «Errore interno del server» su articoli rimasti dopo un arrivo merce eliminato                                               |
| 56  | **P3**  | divergenza-documentazione | Documenti             | L'hub Documenti non ha la voce «Inventario» che il documento funzionale §10.1 elenca sotto Magazzino                                                                  |

---

## Cosa è rimasto nel tenant (da leggere)

I test hanno scritto su un **database condiviso**. La pulizia è riuscita solo in parte: alcuni
oggetti non sono eliminabili per come è fatta l'applicazione. Elenco onesto di ciò che resta:

| Residuo                                                     | Quantità                            | Perché non è stato rimosso                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clienti `E2E-CLI-Azienda…`                                  | **7** (6 sono duplicati non voluti) | L'API clienti non espone `DELETE` e la UI non ha un comando di eliminazione. I 6 duplicati nascono da un difetto dell'helper di un agente (cercava per cognome mentre la lista mostra la ragione sociale) |
| Prodotti `E2E-MOV-…`, `E2E-VEN-…`, `E2E-DOC-…`, `E2E-FOR-…` | **14**                              | Hanno movimenti: l'API risponde 409 «archivialo invece di eliminarlo». Sono stati **archiviati** e le giacenze riportate a 0                                                                              |
| Documenti cassa `VN-0001…VN-0016`, `RN-0001…RN-0014`        | ~30                                 | Vendite e resi al banco sono di sola consultazione per progetto (§11.3)                                                                                                                                   |
| Documenti `INV-0001…INV-0006` + 5 sessioni inventario       | 6 + 5                               | Documenti confermati: non eliminabili                                                                                                                                                                     |
| Fornitore `E2E-FOR-Fornitore`                               | 1                                   | Nessun endpoint di eliminazione fornitori                                                                                                                                                                 |
| Movimenti di rettifica su SKU `555`                         | 10 (5 coppie +2/−2)                 | Effetto netto **nullo**, giacenza verificata al valore di partenza. Causale e operatore li scrive il backend: non erano prefissabili                                                                      |

**Nessuna giacenza di articoli non creati dai test risulta alterata** — tutte le variazioni sono
state compensate e riverificate. Contatori di numerazione dei documenti riportati puliti
(nessun buco). Impostazioni del tenant (U.M. predefinita, codici IVA, opzioni di pagamento,
preferenze colonne) ripristinate ai valori originali.

Effetti collaterali fuori dal database: alcune richieste di recupero password verso
`test@sologestionale.it` hanno fatto scattare il rate limit di Supabase (`429
over_email_send_rate_limit`), che si azzera da solo.

---

## Problemi di ambiente (non difetti dell'app)

1. **Credenziali commesso non valide.** `E2E_CLERK_EMAIL=commesso@test.it` in `.env` viene
   rifiutato da Supabase. L'account risulta _attivo_ in Impostazioni → Utenti, quindi è la
   password in `.env` a essere disallineata. I test sui permessi del commesso sono stati
   eseguiti con gli account granulari `E2E_CLERK_CATALOG_IMPORT_*` dove possibile, e saltati
   altrove: **l'area permessi è coperta solo in parte**.
2. **Una sola location** («Test SG») nel tenant: trasferimenti fra sedi e filtro multi-sede
   non sono testabili.
3. **Browser Playwright disallineati**: build 1228 installata, 1234 attesa da Playwright 1.62.
   I test girano solo perché `devices['Desktop Chrome']` ricade su Chrome di sistema. Serve
   `npx playwright install` (non eseguito).
4. **`prisma migrate status` non funziona**: la CLI è Prisma 7 ma lo schema ha ancora
   `url`/`directUrl` nel datasource (formato v6). Impossibile verificare lo stato delle
   migration senza migrare la configurazione a `prisma.config.ts`.
5. **Gli spec in `e2e/`** puntano a selettori non più esistenti (il form prodotto è stato
   promosso in `domain/products/`): vanno riallineati.

---

## Aree non coperte

- **Vista mobile**: solo un tentativo su movimenti; card view, testata comprimibile e scroll
  orizzontale delle tabelle documentali restano da verificare.
- **Invariante §20.2** («un documento in bozza non muove il magazzino»): non verificabile —
  dalla Fase 3 i documenti nascono confermati e lo stato bozza non è raggiungibile dalla UI.
  Il documento funzionale lo descrive ancora come stato corrente: divergenza nota e voluta.
- **Scanner barcode** con camera o pistola fisica.
- **Permessi per ruolo** oltre il titolare (vedi credenziali commesso sopra).
- **Listini 2 e 3** e la modalità «Netti» come convenzione aziendale: spenti in questo tenant.
- **Integrazione Shopify**: il profilo canale non la espone.

---

# Dettaglio completo dei difetti

Ogni scheda riporta i passi per riprodurre, il comportamento atteso, quello osservato,
l'evidenza raccolta e l'esito della verifica indipendente.

## P1 — 3 difetti

### P1.1 · Chiusura inventario fisico: le rettifiche vengono applicate ma «Applica rettifiche» risponde 409 e la schermata resta «In revisione»

**Area:** Movimenti · **Tipo:** bug · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. /app/inventory/counts/new → nome «E2E-MOV-Inventario-4368905», location «Test SG» (autoselezionata), «Avvia inventario».
2. Nella sessione, cerca lo SKU dell'articolo, scrivi in colonna «Contato» un valore diverso da «Sistema» (3 → 5) ed esci dal campo: la colonna Delta mostra +2.
3. «Invia a revisione» → banner «1 differenze su 1 righe contate».
4. «Applica rettifiche».

**Atteso:** La sessione si chiude: badge «Completata», banner «Sessione completata … Le rettifiche sono state registrate nello storico movimenti», e il link «Apri documento inventario generato →». Nessun errore.

**Osservato:** POST /inventory/counts/68ddf992-5a0f-442f-abdd-96e451e10436/finalize → 409 «Solo i documenti in bozza possono essere confermati.» (5,9 s). A schermo: banner d'errore con quel testo, badge ancora «In revisione», nessun banner di chiusura. Ma lato dati è già successo tutto: giacenza 3 → 5, movimento di rettifica creato, documento INV-0005 creato e confermato, sessione status=completed. Premendo di nuovo «Applica rettifiche» (il pulsante resta lì) arriva un secondo errore diverso: 409 «La sessione deve essere in revisione prima di applicare le rettifiche.» L'operatore vede due errori consecutivi su un'operazione irreversibile già andata a buon fine. Causa visibile nel codice: api/src/inventory/inventory-count.service.ts finalize() chiama this.documents.confirm() su un documento che this.documents.create() crea già confermato (Fase 3 «via le bozze»); confirmDocumentTx rifiuta con «Solo i documenti in bozza possono essere confermati.» Nota: la chiamata ha impiegato 5,9–15,1 s a fronte del timeout HTTP di 15 s del frontend (inventory.service.ts), quindi in una misura su tre la richiesta è stata annullata dal client e l'operatore non ha ricevuto nemmeno il messaggio d'errore.

**Evidenza:** docs/test-results/screenshots-local/mov-inventario-dopo-applica-rettifiche.png e mov-inventario-secondo-tentativo.png. Output test: «[inventario] POST finalize → 409 in 5999ms :: {"message":"Solo i documenti in bozza possono essere confermati.","error":"Conflict","statusCode":409}» · «[inventario] dopo il click → banner chiusura=false · badge=«In revisione» · errore=«Solo i documenti in bozza possono essere confermati.»» · «[inventario] onHand 3 → 5» · «[inventario] sessione lato API → status=completed documentId=null». Riprodotto anche via API pura: POST /inventory/counts/<id>/finalize → 409 in 15088 ms, giacenza 5 → 6, status=completed.

**Verifica indipendente:** Riprodotto da zero con articolo mio (E2E-VER-SKU-022742, giacenza 6, contato 8). POST /inventory/counts/299657d8-.../finalize → 409 in 6327 ms :: {"message":"Solo i documenti in bozza possono essere confermati."}. A schermo: banner d'errore con quel testo, badge ancora «In revisione», nessun banner di chiusura, pulsante «Applica rettifiche» ancora presente. Lato dati era già tutto avvenuto: onHand 6 → 8, movimento di rettifica creato, documento INV-0006 creato e confirmed, sessione status=completed. Secondo tentativo → 409 diverso: «La sessione deve essere in revisione prima di applicare le rettifiche.» ESPERIMENTO DI CONTROLLO decisivo: una sessione finalizzata SENZA differenze (nessun documento da creare) risponde 201 in 1221 ms — la causa è isolata al ramo che crea il documento. Causa nel codice, deterministica: api/src/inventory/inventory-count.service.ts:346 chiama this.documents.confirm() su un documento che this.documents.create() restituisce già confermato (documents.service.ts:1135 chiama confirmDocumentTx dentro la stessa transazione), e confirmDocumentTx rifiuta a documents.service.ts:2285. Nessuna flakiness possibile: non è un caso di contesa sul server condiviso.

---

### P1.2 · Cassa: la stessa vendita si può rendere più volte — la giacenza cresce oltre il venduto

**Area:** Vendita al banco · **Tipo:** bug · **Spec:** `C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\e2e-local\90-vendite.spec.ts`

**Passi**

1. Login titolare, /app/sales/register, scegli la Location «Test SG».
2. Scansiona lo SKU di un articolo con giacenza (E2E-VEN-SKU-92254665), quantità 1.
3. «Concludi vendita» → conferma. Nasce VN-0014; giacenza 11 → 10.
4. Tab «Reso» → cerca «VN-0014» → seleziona la vendita → «Da rendere» 1, «Vendibile (rientra)» attivo, causale «E2E-VEN-primo-reso» → «Registra reso» → conferma. Nasce RN-0009; giacenza 10 → 11 (corretto).
5. RIPETI il punto 4 sulla STESSA vendita VN-0014: la riga mostra ancora «Venduta 1» e «Da rendere» azzerato, nessun avviso che la vendita sia già stata resa.
6. «Registra reso» → conferma.

**Atteso:** Il secondo reso deve essere rifiutato (o limitato al residuo reso-abile = 0): una vendita di 1 pezzo non può restituirne 2. §20.4 «ogni variazione di stock è un movimento tracciato» presuppone che i movimenti corrispondano a merce realmente uscita e rientrata.

**Osservato:** Il secondo reso viene accettato senza alcun avviso: nasce RN-0010 e la giacenza sale a 12. Su una vendita da 1 pezzo sono rientrati 2 pezzi — merce creata dal nulla — e sono stati emessi due documenti di reso (due accrediti al cliente). Ripetibile all'infinito: nessun controllo sul residuo reso-abile né lato UI né lato API (`POST /api/v1/store-sales/returns` non confronta le quantità già rese della vendita origine).

**Evidenza:** Test `cassa: due resi sulla stessa vendita — il venduto non deve poter rientrare due volte` in C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\e2e-local\90-vendite.spec.ts. Output di due esecuzioni consecutive:
Run 1 — VENDITA VN-0013 livello {onHand:9} · primo-reso esito «Reso RN-0007 registrato.» → {onHand:10} · secondo-reso esito «Reso RN-0008 registrato.» → {onHand:11}
Run 2 — VENDITA VN-0014 livello {onHand:10} · «Reso RN-0009 registrato.» → {onHand:11} · «Reso RN-0010 registrato.» → {onHand:12}
Nessun errore a video in entrambi i casi. Screenshot: C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\docs\test-results\screenshots-local\ven-doppio-reso-stessa-vendita.png

**Verifica indipendente:** Riprodotto due volte con uno script indipendente (e2e-local/90-vendite-verifica.spec.ts, test «VERIFICA D1»), su un articolo creato da me con giacenza di partenza NOTA e pari a zero — quindi nessuna contesa con altri agenti e nessun dato di partenza anomalo. Run A: vendita di 1 pezzo VN-0015 → onHand 0→−1; reso RN-0011 → −1→0; SECONDO reso identico RN-0012 accettato con HTTP 201 → onHand 0→+1. Run B identica: VN-0016, RN-0013, RN-0014, onHand 0→−1→0→+1. Su una vendita da 1 pezzo sono rientrati 2 pezzi e sono stati emessi due documenti di reso. La conferma non è solo empirica: `StoreSalesService.createReturn` (api/src/store-sales/store-sales.service.ts:251) verifica SOLO che la vendita origine esista (`findFirst ... select: { reference: true }`) e non legge nulla delle quantità già rese; `listRecentSales` non restituisce alcun campo di residuo, quindi neppure la UI potrebbe calcolarlo. Verificata anche la metà UI: dopo il primo reso la cassa ripropone la stessa vendita nella ricerca resi con «Venduta 1» e «Da rendere» precompilabile, e nel pannello non compare alcuna traccia di «già resa» (log «UI AVVISO GIÀ RESA? false»).

---

### P1.3 · La ricerca libera del Registro documenti non filtra nulla: nessuna chiamata API, URL invariato, lista invariata

**Area:** Documenti · **Tipo:** bug · **Spec:** `e2e-local/80-documenti.spec.ts`

**Passi**

1. Accedi come titolare.
2. Vai su /app/documents/registro e attendi il caricamento (20 righe, contatore in testata).
3. Fai clic nel campo di ricerca (input id="doc-search", placeholder «Cerca per numero, riferimento o note…») e digita CAR con la tastiera.
4. Attendi 3 secondi (il debounce dichiarato nel codice è 300 ms).
5. Ripeti su /app/documents/arrivi-merce e /app/documents/sales-ddt.
6. Controprova: apri direttamente /app/documents/registro?search=E2E-DOC-NON-ESISTE.

**Atteso:** La lista si filtra e l'URL diventa …/registro?search=CAR. Il documento funzionale §10.3 elenca la «ricerca (numero/riferimento/note)» fra i filtri del registro e §20.10 dichiara l'invariante «I filtri di lista vivono nell'URL: ricaricare la pagina mantiene la vista».

**Osservato:** Digitare non produce ALCUN effetto: zero richieste a GET /api/v1/documents, URL invariato, numero di righe invariato, contatore in testata invariato. Il testo digitato però resta nel campo, quindi l'operatore crede di aver filtrato e legge una lista non filtrata. Vale su tutti e tre i profili di elenco provati. La controprova dimostra che il filtro lato server funziona: con ?search= passato nell'URL la testata passa da 20 documenti a 0. Il difetto sta quindi nel percorso «digitazione → URL», non nell'API.

Causa probabile, dal codice (src/app/features/documents/document-list.component.ts): l'effect nel costruttore
effect(() => {
const fromUrl = this.query().search ?? '';
if (fromUrl !== this.searchDraft()) {
this.searchDraft.set(fromUrl);
}
});
legge searchDraft() e quindi si ri-esegue a ogni tasto, riportando il segnale al valore dell'URL PRIMA che il debounceTime(300) di searchSubscription emetta; distinctUntilChanged() scarta l'emissione e applySearch() non viene mai chiamata. Il binding [value]="searchDraft()" non riscrive il DOM perché il valore torna identico al precedente, ed è per questo che il testo digitato resta visibile.

**Evidenza:** Output del test «registro: la ricerca libera filtra la lista» (e2e-local/80-documenti.spec.ts:297):
/app/documents/registro: righe 20->20, url INVARIATA, chiamate API 0
/app/documents/arrivi-merce: righe 1->1, url INVARIATA, chiamate API 0
/app/documents/sales-ddt: righe 3->3, url INVARIATA, chiamate API 0
controprova via URL: 20 documenti senza filtro, 0 con ?search=E2E-DOC-NON-ESISTE
Screenshot: C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\docs\test-results\screenshots-local\doc-ricerca-inerte.png

**Verifica indipendente:** Riprodotto con script indipendente (e2e-local/80-documenti-verifica.spec.ts, test D1), su tre profili di elenco e con DUE forme di digitazione diverse — pressSequentially con delay 150 ms e fill() (un solo evento input) — proprio per escludere l'artefatto di test. Esito: /app/documents/registro righe 20->20, contatore "64 documenti"->"64 documenti", URL invariata, 0 richieste GET /api/v1/documents; idem arrivi-merce (3->3) e sales-ddt (3->3); anche via fill() URL invariata e 0 chiamate. Il testo digitato resta però nel campo (inputValue = "CAR"), quindi l'operatore crede di aver filtrato. Controprova indipendente: /app/documents/registro?search=E2E-VER-DOC-NON-ESISTE porta il contatore da "64 documenti" a "0 documenti", quindi il filtro server e il binding dell'URL funzionano — si rompe solo il percorso digitazione->URL. La spiegazione di codice regge alla lettura: in document-list.component.ts l'effect del costruttore legge searchDraft() insieme a query().search, quindi si ri-esegue a ogni tasto e riporta il segnale al valore dell'URL prima che debounceTime(300) emetta; distinctUntilChanged() scarta l'emissione e applySearch() (riga 1494) non viene mai chiamata.

---

## P2 — 25 difetti

### P2.1 · Recupero password: l'errore mostrato è quello del login («Email o password non corretti.») oppure il testo grezzo inglese di Supabase

**Area:** Autenticazione, shell · **Tipo:** bug · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Da disconnesso apri http://localhost:4200/login
2. Clicca «Password dimenticata?» → /login/forgot-password
3. Inserisci un'email reale e registrata del tenant (E2E_USER_EMAIL, test@sologestionale.it)
4. Premi «Invia link di recupero»
5. Osserva il banner sopra il form

**Atteso:** Il messaggio neutro già previsto dal template: «Se l'email è registrata, riceverai a breve un messaggio con le istruzioni. Controlla anche lo spam.» In caso di errore reale, un messaggio pertinente a QUESTA schermata e in italiano.

**Osservato:** Compare app-inline-banner con «Email o password non corretti.» — una frase che parla di una password che l'utente non ha nemmeno digitato. In una seconda esecuzione (dopo alcuni tentativi) il banner mostrava invece il testo grezzo del provider, in inglese: «email rate limit exceeded». La causa è in src/app/core/auth/supabase-auth.gateway.ts:146-158: `mapAuthError` è condiviso fra signIn e requestPasswordReset — qualunque errore che contenga «invalid» diventa «Email o password non corretti.», e il ramo di fallback rimanda `error.message` di Supabase tale e quale all'utente.

**Evidenza:** Output del test (2 esecuzioni indipendenti):
[recupero] success=false banner=true testo=«Email o password non corretti.»
[recupero] risposte 4xx/5xx: 400 POST .../auth/v1/recover :: {"code":"email_address_invalid","message":"Email address \"test@sologestionale.it\" is invalid"}
e, riseguendo:
[recupero] banner=«email rate limit exceeded»
[recupero] 429 POST .../auth/v1/recover :: {"code":"over_email_send_rate_limit","message":"email rate limit exceeded"}
Screenshot: docs/test-results/screenshots-local/auth-recupero-password-errore.png

**Verifica indipendente:** Riprodotto due volte dal vivo su contesto anonimo: /login/forgot-password con E2E_USER_EMAIL mostra app-inline-banner col testo grezzo del provider «email rate limit exceeded» (429 POST .../auth/v1/recover, code over_email_send_rate_limit). Il secondo ramo — quello che mi interessava di più perché è il più assurdo — non era riproducibile dal vivo finché durava il rate limit del progetto, quindi l'ho isolato intercettando SOLO la risposta di /auth/v1/recover con la stessa 400 osservata dall'altro tester (email_address_invalid, «Email address ... is invalid»): il banner ha risposto «Email o password non corretti.», parlando di una password mai digitata. La causa dichiarata è esatta e verificata leggendo supabase-auth.gateway.ts:146-158: mapAuthError è condiviso fra login(), requestPasswordReset() e updatePassword(), il ramo `message.includes('invalid')` produce la frase del login e il fallback rimanda `error.message` di Supabase tale e quale. Il template ha già il messaggio neutro giusto (forgot-password.component.html:21-26) ma lo mostra solo su success().

---

### P2.2 · /login/reset-password senza alcun token: con una sessione attiva mostra il form «Nuova password» e permette di reimpostare la password senza conoscere quella attuale

**Area:** Autenticazione, shell · **Tipo:** bug · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Accedi normalmente (utente titolare) fino alla dashboard
2. Nella stessa scheda vai a http://localhost:4200/login/reset-password — nessun token, nessun parametro, nessun hash
3. Attendi il termine di «Verifica del link in corso…»
   (controprova) 4. Ripeti da un contesto anonimo, senza sessione: stessa URL

**Atteso:** Una URL che non è un link di recupero non deve essere accettata come tale: come per l'anonimo, «Link non valido o scaduto. Richiedi un nuovo link di recupero.» Se invece si vuole permettere il cambio password a sessione attiva, va chiesta la password corrente (regole-sicurezza: il cambio password è azione sensibile e audit-worthy).

**Osservato:** Con sessione attiva la pagina mostra h1 «Nuova password», i campi #reset-password / #reset-password-confirm e il pulsante «Salva nuova password»: nessuna prova della password corrente, nessun token di recupero. Da anonimo la stessa URL è correttamente respinta. La causa è il fallback finale di establishSessionFromAuthRedirect (src/app/core/auth/auth-redirect-session.util.ts): esauriti token_hash / hash / code, ritorna `{ ok: Boolean(data.session) }` da `client.auth.getSession()` — cioè «esiste una sessione» viene interpretato come «il link di recupero è valido». La rotta è volutamente senza guestGuard (commento in app.routes.ts), quindi non c'è nulla a monte che la protegga. NON ho inviato il form: la password non è stata toccata.

**Evidenza:** Output del test (confermato su due esecuzioni):
[reset] anonimo → banner=«Link non valido o scaduto. Richiedi un nuovo link di recupero.» form=false
[reset] con sessione → h1=«Nuova password» form-password=true submit=«Salva nuova password»
Screenshot: docs/test-results/screenshots-local/auth-reset-password-con-sessione.png

**Verifica indipendente:** Riprodotto due volte, con controprova anonima nella stessa esecuzione. Anonimo: h1 «Nuova password», nessun form, banner «Link non valido o scaduto. Richiedi un nuovo link di recupero.» Con sessione titolare, stessa URL senza token/hash/query: h1 «Nuova password», sottotitolo «Scegli una password sicura per il tuo account VestiFlow.», #reset-password e #reset-password-confirm visibili, submit «Salva nuova password», nessun banner. La causa indicata è corretta: establishSessionFromAuthRedirect (auth-redirect-session.util.ts:162-163) chiude con `const { data } = await client.auth.getSession(); return { ok: Boolean(data.session), ... }` — «esiste una sessione» viene letto come «il link di recupero è valido». La rotta è volutamente senza guestGuard (commento in app.routes.ts) e nulla a monte la protegge. Non ho inviato il form.

---

### P2.3 · Contrasto sotto la soglia AA nella topbar (ricerca globale e kbd ⌘K) su OGNI pagina della shell: axe segnala color-contrast serious ovunque

**Area:** Autenticazione, shell · **Tipo:** a11y · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Accedi e apri una qualsiasi pagina sotto /app (dashboard, prodotti, documenti, impostazioni), tema chiaro
2. Esegui axe-core con i tag wcag2a/wcag2aa (il progetto ha già @axe-core/playwright)
3. Guarda i nodi della violazione «color-contrast»

**Atteso:** Zero violazioni serious/critical (regole-qualita, sezione Accessibility check: «axe su ogni route principale: zero violazioni serious o critical»; regole-architettura: contrasto minimo 4.5:1 AA).

**Osservato:** Violazione «color-contrast» di impatto serious su TUTTE le rotte di shell provate, con due nodi sempre presenti perché appartengono alla topbar:
· .app-topbar__search-placeholder — 3.1:1 (fg #8a9498 = --color-text-subtle su #ffffff, 13px)
· kbd.app-topbar__search-kbd — 2.95:1 (#8a9498 su #f8faf9, 11px)
Si aggiungono, pagina per pagina, i nodi che usano --color-text-muted (#657075): 4.45:1 sui sottotitoli di pagina (su --color-bg #eef0f2) e 4.31:1 sulle intestazioni di tabella (su --color-table-header-bg #e9edee) — sotto soglia per poco, ma sistematici. Non è un difetto di una schermata: sono i token --color-text-subtle e --color-text-muted a non reggere l'AA sulle superfici su cui il design system stesso li appoggia. /login invece è pulito (0 violazioni).

**Evidenza:** Output axe del test:
[a11y] /login: 0 violazioni, 0 serious/critical
[a11y] /app/dashboard: 1 violazioni, 1 serious/critical → serious color-contrast (3 nodi)
· .app-topbar__search-placeholder :: insufficient color contrast of 3.1 (fg #8a9498, bg #ffffff, 13px). Expected 4.5:1
· kbd :: insufficient color contrast of 2.95 (fg #8a9498, bg #f8faf9, 11px)
· .dashboard__subtitle :: 4.45 (fg #657075, bg #eef0f2)
[a11y] /app/products / /app/documents: stessa terna; /app/settings: 10 nodi (incl. th intestazione tabella 4.31)
Screenshot: docs/test-results/screenshots-local/auth-a11y--app-dashboard.png

**Verifica indipendente:** axe-core (wcag2a+wcag2aa) rieseguito da me sulle quattro rotte: /login 0 violazioni; /app/dashboard 3 nodi, /app/products 8, /app/documents 3, /app/settings 10 — sempre color-contrast, impatto serious. I due nodi della topbar ci sono su tutte e quattro: .app-topbar__search-placeholder 3.1:1 (#8a9498 su #ffffff, 13px) e kbd 2.95:1 (#8a9498 su #f8faf9, 11px). Confermati anche i nodi --color-text-muted: 4.45:1 sui sottotitoli di pagina (#657075 su #eef0f2) e 4.31:1 sulle intestazioni di tabella (#657075 su #e9edee), inclusi i bottoni di ordinamento colonna in /app/products. La diagnosi è giusta: non è una schermata, sono due token che non reggono l'AA sulle superfici su cui il design system li appoggia.

---

### P2.4 · Due input file senza etichetta in /app/settings: axe segnala «label» di impatto critical

**Area:** Autenticazione, shell · **Tipo:** a11y · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Accedi come titolare e apri http://localhost:4200/app/settings
2. Esegui axe-core con i tag wcag2a/wcag2aa
3. Guarda la violazione «label»

**Atteso:** Ogni <input> ha una label associata via id/for oppure aria-label / aria-labelledby (regole-architettura, sezione A11y). Zero violazioni critical.

**Osservato:** Violazione «label» di impatto critical, 2 nodi:
· .profile-avatar-upload__input (caricamento avatar del profilo)
· .tenant-backup-panel__file-input (selezione file del pannello backup)
Entrambi non hanno né label implicita né esplicita né aria-label: con uno screen reader il campo è annunciato solo come «pulsante scegli file», senza dire cosa si sta caricando. Nota: appartengono all'area Impostazioni/profilo, non alla shell — li riporto perché emersi nel giro axe sulle pagine di shell e perché sono l'unica violazione critical trovata.

**Evidenza:** Output axe del test:
[a11y] /app/settings: 2 violazioni, 2 serious/critical
→ critical label (2 nodi): Form elements must have labels
· .profile-avatar-upload__input :: Element does not have an implicit (wrapped) <label> … aria-label attribute does not exist or is empty
· .tenant-backup-panel__file-input :: idem
Screenshot: docs/test-results/screenshots-local/auth-a11y--app-settings.png

**Verifica indipendente:** Riprodotto identico nel mio giro axe: /app/settings → violazione «label», impatto critical, esattamente 2 nodi — .profile-avatar-upload__input e .tenant-backup-panel__file-input — entrambi senza label implicita, esplicita, aria-label o aria-labelledby. È l'unica violazione critical trovata sull'intera area.

---

### P2.5 · L'ordinamento delle colonne della lista prodotti non ha alcun effetto: sort/order non arrivano mai all'API

**Area:** Prodotti: lista · **Tipo:** bug · **Spec:** `e2e-local/30-prodotti-lista.spec.ts`

**Passi**

1. Vai su /app/products?pageSize=50 e annota l'ordine delle righe.
2. Clicca l'intestazione «Nome» (bottone aria-label «Ordina per nome»).
3. Osserva l'URL: diventa ?pageSize=50&order=desc e il th prende aria-sort="descending", la freccia si gira.
4. Osserva la scheda Network: la chiamata è GET /api/v1/products?page=1&pageSize=50 — senza sort, senza order.
5. Confronta l'elenco: identico a prima.
6. Ripeti con «Ordina per stato» (URL ?sort=status): stessa chiamata, stesso elenco.

**Atteso:** Cliccando l'intestazione l'elenco si riordina per quel campo, nel verso indicato dalla freccia. La lista aperta senza parametri è ordinata per nome crescente, come dichiarano parseProductListQuery (DEFAULT_PRODUCT_SORT='name', DEFAULT_PRODUCT_ORDER='asc') e l'aria-sort dell'intestazione.

**Osservato:** Nessun riordino, mai, su nessuna colonna. Le uniche cose che cambiano sono l'URL, la freccia e l'attributo aria-sort — cioè proprio i segnali che dicono all'operatore (e allo screen reader) che l'ordinamento è avvenuto. L'elenco resta sempre nell'ordine deciso dal server, che è `updatedAt desc` scritto in duro. Catena completa: `src/app/domain/products/services/product.service.ts:120-131` costruisce gli HttpParams con page/pageSize/search/status/category/brand/season e non aggiunge mai sort/order; `api/src/products/dto/list-products.query.dto.ts` non ha campi sort/order, quindi l'API non li accetterebbe comunque; `api/src/products/products.service.ts:168` fissa `orderBy: { updatedAt: 'desc' }`. Anche il default dichiarato (nome crescente) è falso: all'apertura l'elenco esce «E2E-MOV-Articolo-3503772, E2E-FOR-Articolo, ..., Pippo Franco, goku, Topolino, eeee, Test vendita».

**Evidenza:** Test `lista: ordinamento colonne e paginazione` (e2e-local/30-prodotti-lista.spec.ts:147). Output: `[sort] richieste API alla lista: ["http://localhost:3000/api/v1/products?page=1&pageSize=50","http://localhost:3000/api/v1/products?page=1&pageSize=50"]` — due chiamate identiche, prima e dopo il click. `[sort] asc` e `[sort] desc` sono lo stesso array di 30 nomi. Screenshot: docs/test-results/screenshots-local/plst-ordinamento-inefficace.png. Verificato anche navigando direttamente a ?pageSize=50&order=desc e ?pageSize=50&sort=status: elenco identico byte a byte.

**Verifica indipendente:** Riprodotto due volte con script indipendente (e2e-local/30-prodotti-lista-verifica.spec.ts, test V1). Intercettando le richieste: dopo due click su «Ordina per nome» le uniche chiamate sono `GET /api/v1/products?page=1&pageSize=50` e `GET /api/v1/products?page=1&pageSize=50` — nessun parametro sort/order in nessuna richiesta (`qualche URL contiene sort/order? false`). L'URL del browser diventa `?pageSize=50&order=desc` e il th passa ad `aria-sort=descending`, ma l'elenco è identico byte a byte prima e dopo (`elenco invariato dopo 1° click? true`, `dopo 2° click? true`). Idem navigando direttamente a `?sort=status&order=desc` (`invariato? true`). Confermato anche il default falso: all'apertura senza parametri l'elenco NON è alfabetico (`default è già name asc? false`) in entrambe le esecuzioni, ed è cambiato fra la prima e la seconda seguendo gli articoli creati nel frattempo da un altro agente — cioè `updatedAt desc`. Catena di codice verificata: `src/app/domain/products/services/product.service.ts:120-131` (nessun sort/order fra gli HttpParams), `api/src/products/dto/list-products.query.dto.ts` (nessun campo sort/order), `api/src/products/products.service.ts:168` (`orderBy: { updatedAt: 'desc' }`).

---

### P2.6 · La colonna «Varianti» della lista mostra 0 su articoli che hanno varianti (conta le combinazioni di opzioni, non le varianti)

**Area:** Prodotti: lista · **Tipo:** dato-incoerente · **Spec:** `e2e-local/30-prodotti-lista.spec.ts`

**Passi**

1. Vai su /app/products?pageSize=50.
2. Leggi la colonna «Varianti»: 25 righe su 26 dicono 0.
3. Clicca una qualsiasi di quelle righe (es. «E2E-PFRM-RAPIDO-560012»).
4. Nel dettaglio, guarda il pannello «Varianti»: il contatore dice 1 e la tabella ha 1 riga con SKU, prezzo e barcode.

**Atteso:** La colonna «Varianti» conta le varianti realmente esistenti dell'articolo, coerente col contatore del dettaglio.

**Osservato:** La lista dice 0 dove il dettaglio dice 1. Il valore non viene dalle varianti ma da `variantCount()` in `src/app/features/products/components/product-table/product-table.component.ts:79-84`, che moltiplica fra loro i valori di `product.options` e restituisce 0 quando `options` è vuoto. La risposta della lista conferma: `options=[] variants=0` per ogni articolo creato senza opzioni dichiarate (creazione rapida, quick-add da documento, arrivo merce) — cioè la quasi totalità del catalogo di questo tenant. Di riflesso il numero è sbagliato anche in eccesso quando le opzioni esistono ma non tutte le combinazioni sono state generate: la colonna mostra le combinazioni possibili, non le varianti create.

**Evidenza:** Test `dettaglio: dati generali, varianti e etichetta singola` (e2e-local/30-prodotti-lista.spec.ts:478). Output: `[varianti] "E2E-PFRM-RAPIDO-560012" → colonna lista=0, contatore dettaglio=1, righe=1`. Ricognizione su 26 righe: solo «Test vendita» mostra 1, tutte le altre 0. Payload API della lista: `E2E-MOV-Articolo-3097208 options=[] variants=0` mentre il suo dettaglio ha 1 variante. Screenshot: docs/test-results/screenshots-local/plst-varianti-zero-in-lista.png.

**Verifica indipendente:** Riprodotto (test V2). Su 26 righe lette: 24 mostrano «0» e 2 mostrano «1» (`distribuzione colonna: {"0":24,"1":2}`). Aperti quattro dei ventiquattro articoli a 0, tutti e quattro smentiscono la lista: `E2E-DOC-Articolo 94542256 lista=0 dettaglio=1 righeTabella=1`, `E2E-MOV-Articolo-4368905 lista=0 dettaglio=1 righeTabella=1`, `E2E-DOC-Articolo 94296434 lista=0 dettaglio=1 righeTabella=1`, `E2E-MOV-Articolo-3847511 lista=0 dettaglio=1 righeTabella=1`. Il contatore del dettaglio (`.product-detail__count`) e le righe reali della tabella varianti concordano fra loro e discordano dalla lista. Causa confermata in `src/app/features/products/components/product-table/product-table.component.ts:78-84`: `variantCount()` moltiplica i valori di `product.options` e ritorna 0 con `options` vuoto — non guarda le varianti.

---

### P2.7 · Il filtro Stato stock (Disponibile/Esaurito) è applicato solo alla pagina già caricata: la paginazione continua a dichiarare il totale non filtrato

**Area:** Magazzino: giacenze · **Tipo:** bug · **Spec:** `e2e-local/50-magazzino-giacenze.spec.ts`

**Passi**

1. Login titolare, vai su /app/inventory (Magazzino → Giacenze).
2. Premi «Azzera filtri» e leggi la paginazione in fondo: «1–20 di 20».
3. Apri il filtro «Stato stock» e scegli «Esaurito».
4. Conta le righe rimaste in tabella e rileggi la paginazione.

**Atteso:** Il filtro interroga tutte le giacenze e la paginazione descrive ciò che è a schermo (es. «1–7 di 7»).

**Osservato:** In tabella restano 7 righe (tutte correttamente «Esaurito») ma la paginazione continua a dire «1–20 di 20». Causa: in inventory-levels.component.ts la query server-side manda solo `lowStockOnly` per lo stato «Sotto soglia», mentre «Disponibile» ed «Esaurito» vengono filtrati nel computed rows() DOPO che il server ha già paginato e contato. Conseguenza su cataloghi reali (>1 pagina): le righe che corrispondono al filtro restano sparse su più pagine, la pagina corrente può mostrarne pochissime o nessuna, e i conteggi mostrati sono falsi. Stessa dinamica misurata con page size 10: con «Esaurito» attivo la pagina 1 mostra 3 righe sulle 6 esaurite totali.

**Evidenza:** docs/test-results/screenshots-local/giacenze-paginazione-non-coerente-col-filtro.png · output test: «ESAURITO: righe mostrate 7 | paginazione 1–20 di 20» (riprodotto in 3 esecuzioni: 6 righe con «di 14», 8 con «di 19», 7 con «di 20»)

**Verifica indipendente:** Riprodotto con script indipendente in 3 esecuzioni, su dati diversi da quelli dell'altro agente (il tenant nel frattempo è passato da 20 a 25 giacenze). Misure: senza filtri 20 righe / paginazione «1–20 di 25»; con «Esaurito» 13 righe ma paginazione ancora «1–20 di 25»; con «Disponibile» 7 righe, sempre «1–20 di 25». La verità letta a parte dall'API (GET /inventory/levels?pageSize=100, 25 righe totali) dice 15-16 esauriti e 11 disponibili: quindi con il filtro attivo 2-3 esauriti restano invisibili e nessun elemento dell'interfaccia lo segnala. Prova decisiva con «Per pagina» = 10 e «Esaurito»: le tre pagine mostrano 8, 6 e 2 righe (somma 16 = tutti gli esauriti) mentre i contatori dicono «1–10 di 25», «11–20 di 25», «21–25 di 25». Il contatore delle richieste inserito nel test conferma la causa: cambiando lo stato da «Esaurito» a «Disponibile» NON parte alcuna nuova chiamata a /inventory/levels, perché `levelsQuery` non cambia (inventory-levels.component.ts:208-219 manda al server solo `lowStockOnly`) e il filtro vive nel computed `rows()` (righe 345-353), cioè dopo che il server ha paginato e contato.

---

### P2.8 · Le rettifiche generate dall'import CSV giacenze non registrano chi le ha eseguite

**Area:** Magazzino: giacenze · **Tipo:** dato-incoerente · **Spec:** `e2e-local/50-magazzino-giacenze.spec.ts`

**Passi**

1. /app/inventory/import, carica un CSV valido (colonne SKU,Location,Disponibile) e conferma l'import.
2. Vai in Magazzino → Movimenti e cerca lo SKU importato.
3. Guarda la colonna Operatore, poi apri il filtro «Operatore».

**Atteso:** Il movimento porta il nome dell'utente che ha eseguito l'import, come tutti gli altri movimenti (l'arrivo merce sulla stessa variante dice «Domenico SG»). Doc §20.4 e regola «Auditabilità UI» chiedono chi ha eseguito l'azione.

**Osservato:** La rettifica risulta eseguita da «Import CSV»: nel record createdById è null e createdByName è la stringa fissa «Import CSV» (api/src/inventory/inventory-import.service.ts chiama registerMovement con actorDisplayName 'Import CSV' e actorUserId undefined). In un tenant con più operatori abilitati all'import non si può più risalire a chi ha cambiato le quantità. Effetto collaterale: il filtro Operatore elenca ["API","Domenico SG","Import CSV"], cioè due voci che non sono persone.

**Evidenza:** docs/test-results/screenshots-local/movimenti-import-senza-operatore.png · risposta API GET /inventory/movements?search=555 → {"type":"adjustment","reason":"Import CSV giacenze","createdById":null,"createdByName":"Import CSV"} · GET /inventory/movements/operators → ["API","Domenico SG","Import CSV"]

**Verifica indipendente:** Verificato leggendo l'API con gli header di sessione reali dell'app. GET /inventory/movements/operators → ["API","Domenico SG","Import CSV"]. GET /inventory/movements?createdBy=Import%20CSV → 10 movimenti, tutti `{"type":"adjustment","origin":"manual","reason":"Import CSV giacenze","createdById":null,"createdByName":"Import CSV"}`. Non è una convenzione deliberata: `inventory-import.service.ts:393-406` chiama `registerMovement(tenantId, dto, 'Import CSV', undefined, user)` — l'oggetto `user` viene passato come quinto argomento (serve ai controlli di location) ma il suo `displayName`/`id` vengono scartati, mentre il controller per i movimenti manuali passa correttamente `user.displayName, user.id` (inventory.controller.ts:265 e 275). L'attore è a portata di mano e viene buttato via.

---

### P2.9 · Tab Varianti: il prezzo di vendita per variante è mostrato con 14 decimali (40,90163934426229)

**Area:** Prodotti: creazione · **Tipo:** bug · **Spec:** `.claude/rules/regole-gestionale.md §Denaro`

**Passi**

1. Contesto tenant di prova (verificato via API): Impostazioni azienda `salesPricesIncludeVat = true` (prezzi IVATI), Codice IVA predefinito 22%, `listino1Active = true`.
2. Aprire /app/products/new e attendere il caricamento completo (compare il toggle Netti/Ivati, preselezionato su «Ivati»).
3. Nome prodotto: «E2E-PFRM-EVID-296399». Sezione Listini in modalità «Ivati» → Prezzo di vendita = 49,90. Costo di riferimento = 20,00.
4. Passare al tab «Varianti» e aggiungere alla Taglia i valori S e M (bastano 2 combinazioni).
5. Scorrere fino alla tabella «Completa i dati di ogni variante» e leggere la colonna «Prezzo di vendita».
6. Salvare con «Crea prodotto», riaprire il prodotto in modifica e tornare sul tab Varianti.

**Atteso:** Un prezzo con DUE decimali, sempre. regole-gestionale.md §Denaro: «Si arrotonda solo all'USCITA» e «All'operatore si mostrano sempre e solo 2 decimali, in ogni schermata e in ogni stampa». La coda a sei decimali è il formato di memorizzazione, non un valore da mettere in un campo che l'operatore legge e può modificare.

**Osservato:** Ogni riga variante mostra `40,90163934426229` (14 decimali) — è il netto esatto scorporato da 49,90 al 22%, riversato nel campo senza arrotondamento di uscita. Dopo il salvataggio e la riapertura il campo mostra `40.901639` (6 decimali): il difetto resta anche sul prodotto persistito. Il campo è editabile in quello stato. Il dato salvato è invece corretto (il dettaglio prodotto mostra 40,90 €): è un difetto di uscita, non di memorizzazione.

**Evidenza:** Screenshot: docs/test-results/screenshots-local/evid-varianti-prezzo-14-decimali.png (colonna «Prezzo di vendita» = 40,901639344262… su entrambe le righe, con «Prezzo acquisto» = 20 accanto).
Output test T9 (e2e-local/40-prodotti-form.spec.ts):
[T9] prezzi variante mostrati: [{"label":"Prezzo di vendita per S / Rosso","value":"40.90163934426229"},{"label":"Prezzo di vendita per S / Blu","value":"40.90163934426229"}]
[T9] dopo salvataggio: [{"label":"Prezzo di vendita per M / Blu","value":"40.901639"},...]

**Verifica indipendente:** Riprodotto con spec indipendente (V1 e V6 in e2e-local/40-prodotti-form-verifica.spec.ts). Modalità «Ivati» attiva e verificata a runtime (aria-pressed=true), prezzo articolo 49,90 → campi variante `40.90163934426229` su entrambe le righe (14 decimali). Dopo «Crea prodotto» e riapertura in /edit i campi mostrano `40.901639` (6 decimali). Confermato anche dal codice: `product-general-step.component.ts` memorizza il netto ESATTO (`netFromGrossExact`, riga 619) e `product-variants-step.component.html` lega il valore grezzo del draft a un `<input type=number step=0.01>` senza alcun punto di uscita — mentre nel tab Articolo lo stesso valore passa da `toDisplayed()` che arrotonda. Violazione diretta di regole-gestionale §Denaro («All'operatore si mostrano sempre e solo 2 decimali, in ogni schermata»).

---

### P2.10 · «Prezzo di vendita» vale ivato nel tab Articolo e netto nel tab Varianti, stessa maschera e nessun selettore

**Area:** Prodotti: creazione · **Tipo:** dato-incoerente · **Spec:** `.claude/rules/regole-gestionale.md §«Netto/ivato: chi decide, in che ordine»`

**Passi**

1. Stesso contesto e stessi passi 1-5 del difetto precedente (49,90 digitato in modalità «Ivati», IVA 22%).
2. Confrontare il campo «Prezzo di vendita» del tab Articolo con la colonna «Prezzo di vendita» della tabella varianti.
3. Contare i toggle Netti/Ivati presenti nel tab Varianti.

**Atteso:** La stessa etichetta, nella stessa maschera, deve significare la stessa cosa. O la tabella varianti eredita la modalità della sezione Listini (49,90), oppure dichiara esplicitamente che è netta. regole-stile-ui §1: «Un solo modo di fare le cose».

**Osservato:** Tab Articolo: «Prezzo di vendita» = 49,90 (ivato, toggle su «Ivati»). Tab Varianti: «Prezzo di vendita» = 40,901639… (netto). Nel tab Varianti non esiste alcun toggle Netti/Ivati (contati 0 elementi `.segmented__item`) né alcuna indicazione della modalità. Conseguenza concreta: un operatore che «corregge» il campo variante riscrivendoci 49,90 sta impostando un prezzo NETTO di 49,90, cioè 60,88 ivati — un errore di prezzo del 22% che nessun avviso segnala.

**Evidenza:** Screenshot appaiati: docs/test-results/screenshots-local/evid-articolo-49-90-ivato.png (Listini, toggle «Ivati» attivo, Prezzo di vendita 49,90) e docs/test-results/screenshots-local/evid-varianti-prezzo-14-decimali.png (stesso prodotto, stesso momento, 40,901639…).

**Verifica indipendente:** Riprodotto nello stesso passaggio del test V1: tab Articolo `#product-selling-price` = 49.90 con toggle «Ivati» attivo, tab Varianti stessa etichetta = 40.90163934426229. Contati 0 `.segmented__item` dentro `app-product-variants-step` e 0 segmented visibili nell'intero tab: nessun selettore né indicazione di modalità. Confermato in modifica (V6): `[V6] modifica · modalità = Ivati · prezzo articolo = 49.9` mentre le righe variante mostrano 40.901639. Il codice conferma il rischio descritto: il formControl `sellingPrice` della riga variante finisce diritto in `draft.variants[].sellingPrice`, che è la grandezza NETTA memorizzata — riscriverci 49,90 imposta davvero un netto di 49,90 (60,88 ivati) senza alcun avviso.

---

### P2.11 · SKU/EAN già in uso: l'errore compare live ma «Crea prodotto» resta premibile — il blocco arriva solo dal server (409)

**Area:** Prodotti: creazione · **Tipo:** bug · **Spec:** `.claude/rules/regole-gestionale.md §«Controlli e validazioni» / §«Eccezione — Vincoli di integrità dei dati»`

**Passi**

1. Creare un prodotto con SKU «E2E-PFRM-SKU-296399» (nome E2E-PFRM-EVID-296399, prezzo 10) e salvarlo.
2. Aprire /app/products/new, mettere un nome nuovo e prezzo 10.
3. Nel campo SKU digitare «E2E-PFRM-SKU-296399» e attendere ~1 s (debounce 400 ms + verifica server).
4. Sotto il campo compare in rosso «SKU già in uso da un altro prodotto.» — guardare in fondo alla maschera il pulsante «Crea prodotto».
5. Premerlo comunque.
6. Ripetere i passi 2-4 usando l'EAN di un prodotto esistente al posto dello SKU.

**Atteso:** Blocco hard nella UI. regole-gestionale.md §«Eccezione — Vincoli di integrità dei dati» elenca SKU e Barcode/EAN duplicati fra i blocchi hard, con «validazione live mentre l'utente digita, non solo al submit». Nella STESSA maschera il codice articolo duplicato fa esattamente così: il messaggio compare e la CTA si disabilita.

**Osservato:** Il messaggio inline compare correttamente e in tempo reale, ma «Crea prodotto» resta ABILITATO. Premendolo parte la POST, che torna 409 «SKU già presenti a catalogo: E2E-PFRM-SKU-296399»; la maschera mostra l'errore in fondo e non naviga. Nessun duplicato viene creato (il backend regge), ma il blocco «immediato in UI» non c'è. Identico per l'EAN: «EAN già in uso da un'altra variante.» → CTA abilitata → 409 «Barcode già presenti a catalogo: 6639673918233».
Riguarda SOLO l'articolo a variante singola: nel percorso multi-variante (tab Varianti) la CTA si disabilita correttamente. Causa probabile: in ProductQuickVariantFieldsComponent la `validChange` è emessa solo da `form.valueChanges` (metodo `emitState()`), quindi l'arrivo asincrono degli input `takenSkus`/`takenBarcodes` aggiorna il template ma non riemette mai la validità al padre — mentre `variantsValid()` del form padre, usato dal percorso multi-variante, controlla `takenSkus().length > 0`.

**Evidenza:** Screenshot: docs/test-results/screenshots-local/evid-sku-duplicato-cta-abilitata.png (messaggio rosso sotto il campo SKU e «Crea prodotto» in evidenza, non disabilitato) e evid-sku-duplicato-errore-server.png.
Output test T7: `[T7] SKU duplicato · errore visibile=true · CTA abilitata=true` / `[T7] EAN duplicato · errore visibile=true · CTA abilitata=true` / `[API 409] POST http://localhost:3000/api/v1/products :: {"message":"SKU già presenti a catalogo: E2E-PFRM-SKU-296399","error":"Conflict","statusCode":409}`.

**Verifica indipendente:** Riprodotto integralmente (V3). Creato un occupante con SKU noto; su maschera nuova: `[V3] SKU duplicato · errore visibile=true · CTA abilitata=true`; premuto il pulsante → `[API 409] POST /api/v1/products :: {"message":"SKU già presenti a catalogo: E2E-VERI-520704-SKU",...}`, nessun duplicato creato, errore mostrato in fondo alla maschera. Identico per l'EAN: `[V3] EAN duplicato · errore visibile=true · CTA abilitata=true`. Verificato anche il controfattuale indicato dal segnalante: nel percorso multi-variante `[V3] multi-variante · SKU duplicato · errore visibile=true · CTA abilitata=false`, cioè lì il blocco funziona. La causa indicata regge alla lettura del codice: `ProductQuickVariantFieldsComponent.emitState()` (riga 183) è invocato solo da `form.valueChanges` e una volta in `ngOnInit`, quindi l'arrivo asincrono di `takenSkus`/`takenBarcodes` (debounce 400 ms in product-form.component.ts:439) aggiorna il template ma non riemette `validChange`; e `canSubmit()` (riga 698) per l'articolo a variante singola guarda solo `quickVariantStepValid()`, mai `takenSkus()`.

---

### P2.12 · Il dettaglio prodotto mostra i prezzi NETTI mentre la maschera li mostra IVATI — e il prezzo barrato, lì accanto, è ivato

**Area:** Prodotti: creazione · **Tipo:** dato-incoerente · **Spec:** `.claude/rules/regole-gestionale.md §«La convenzione ha due comportamenti diversi»`

**Passi**

1. Contesto: convenzione aziendale «prezzi di vendita ivati» (`salesPricesIncludeVat = true`), IVA predefinita 22%.
2. Aprire un prodotto in modifica, sezione Listini in modalità «Ivati» (la modalità che la maschera propone da sola) e digitare: Prezzo di vendita 29,90 · Listino 1 24,90 · Prezzo barrato 39,90 · Costo di riferimento 12,34.
3. Salvare.
4. Aprire /app/products/<id> e leggere il pannello «Dati generali».

**Atteso:** regole-gestionale.md, §«Netto/ivato: chi decide, in che ordine»: la convenzione aziendale «vale quindi anche per le viste che non sono documenti — anagrafica e listini oggi», e per le viste va «letta ogni volta che si guarda». Quindi 29,90 / 24,90 / 39,90 — oppure, se si sceglie di restare netti, un'etichetta che lo dica.

**Osservato:** Sullo stesso pannello: «Prezzo di vendita 24,51 €», «Listino 1 20,41 €», «Prezzo barrato 39,90 €», «Costo di riferimento 12,34 €». Due valori sono scorporati e due no, senza nulla che li distingua: l'operatore che ha digitato 29,90 un minuto prima legge 24,51 e non ha modo di capire perché il barrato accanto sia rimasto 39,90. Il commento nel template (product-detail.component.html, «Sono i valori NETTI memorizzati: qui non c'è modalità di visualizzazione da scegliere») conferma che è una scelta, ma è la scelta opposta a quella della regola.

**Evidenza:** Screenshot: docs/test-results/screenshots-local/dettaglio-prezzo-diverso-da-maschera.png (Dati generali di E2E-PFRM-RAPIDO-862475: 24,51 € / 20,41 € / 39,90 € / 12,34 €).
Output test T5: `[T5] modalità=Ivati · maschera=29.9 · dettaglio=24,51 €`.

**Verifica indipendente:** Riprodotto (V4) con i valori esatti del segnalante. Maschera in modalità «Ivati» verificata a runtime: {"vendita":"29.90","listino1":"24.90","barrato":"39.90","costo":"12.34"}. Subito dopo il salvataggio, pannello «Dati generali»: [{"term":"Prezzo di vendita","value":"24,51 €"},{"term":"Listino 1","value":"20,41 €"},{"term":"Prezzo barrato","value":"39,90 €"},{"term":"Costo di riferimento","value":"12,34 €"}]. Due valori scorporati e due no, senza etichetta né selettore che li distingua. Divergenza dalla regola citata (regole-gestionale §«La convenzione ha due comportamenti diversi»: per le viste la convenzione va «letta ogni volta che si guarda»), e il commento in product-detail.component.html righe 169-171 conferma che è una scelta deliberata.

---

### P2.13 · Il redirect da /app/reports/corrispettivi[/print] scarta TUTTI i query param: la stampa per il commercialista esce con un altro periodo

**Area:** Dashboard, Report · **Tipo:** bug · **Spec:** `src/app/features/reports/reports.routes.ts:56-57`

**Passi**

1. Aprire (segnalibro / link vecchio) http://localhost:4200/app/reports/corrispettivi/print?period=year&ambito=online
2. Attendere il caricamento della pagina di stampa
3. Leggere il periodo scritto sul foglio
4. Ripetere con /app/reports/corrispettivi?period=cal_quarter&year=2026&quarter=2&ambito=online

**Atteso:** L'indirizzo canonico raggiunto conserva i parametri: /app/sales/corrispettivi/print?period=year&ambito=online, e il foglio stampa 1 gen 2026 – 17 ago 2026 (anno corrente, solo ambito Online). È quello che promette il commento della rotta: «chi ha un segnalibro sul vecchio finisce sul canonico invece di vedere una pagina gemella».

**Osservato:** Si atterra su /app/sales/corrispettivi/print SENZA alcun parametro. Il foglio stampa «19 lug 2026 – 17 ago 2026» (il preset di default a 30 giorni) e l'ambito torna a «Tutti». Nessun avviso: la pagina sembra corretta, ma è un registro fiscale diverso da quello richiesto. Stesso comportamento sulla rotta non-print. Da notare il contrasto: il catch-all `**` i parametri li conserva davvero (/app/reports/accountant-register?period=year → /app/dashboard?period=year), quindi il redirect voluto si comporta peggio di quello accidentale.

**Evidenza:** Test T8 in e2e-local/20-dashboard-report.spec.ts (fallisce, riprodotto in 3 esecuzioni distinte). Output:
[T8] /app/reports/corrispettivi?period=year → /app/sales/corrispettivi · periodo mostrato: 19 lug 2026 – 17 ago 2026
[T8] /app/reports/corrispettivi?period=cal_quarter&year=2026&quarter=2&ambito=online → /app/sales/corrispettivi · periodo mostrato: 19 lug 2026 – 17 ago 2026
[T8] /app/reports/corrispettivi/print?period=year&ambito=online → /app/sales/corrispettivi/print · periodo mostrato: 19 lug 2026 – 17 ago 2026
[T8] catch-all: /app/reports/accountant-register?period=year → /app/dashboard?period=year
Screenshot: docs/test-results/screenshots-local/T8-redirect-legacy.png

**Verifica indipendente:** Riprodotto con script indipendente (V1, 2 esecuzioni). Ho aggiunto la controprova che l'agente originale non aveva fatto, e che chiude ogni dubbio sull'ipotesi «param inventati»: sul CANONICO /app/sales/corrispettivi/print?period=year il foglio stampa «1 gen 2026 – 17 ago 2026», senza param stampa «19 lug 2026 – 17 ago 2026»; passando dal legacy /app/reports/corrispettivi/print?period=year&ambito=online si atterra su /app/sales/corrispettivi/print con query finale ESATTAMENTE vuota ("") e il foglio stampa «19 lug 2026 – 17 ago 2026». Quindi i parametri sono validi sul bersaglio (parseReportListQuery accetta period/year/quarter, e la pagina legge ambito) e li perde il redirect. Stesso esito su /app/reports/corrispettivi?period=cal_quarter&year=2026&quarter=2&ambito=online e su ?period=year. Confermato anche il contrasto col catch-all: /app/reports/accountant-register?period=year → /app/dashboard?period=year, i param li conserva.

---

### P2.14 · Il periodo dei grafici, dichiarato «indipendente», viene azzerato ogni volta che si cambia il periodo dei KPI

**Area:** Dashboard, Report · **Tipo:** bug · **Spec:** `src/app/domain/analytics/components/business-analytics-panel/business-analytics-panel.component.html:114-120 (+ business-analytics-charts.component.ts:82-93)`

**Passi**

1. Aprire http://localhost:4200/app/reports?period=30d e attendere il pannello «Performance commerciale»
2. Nel riquadro «Andamento e composizione» impostare «Periodo grafici» = «Anno corrente»
3. Verificare che i grafici mostrino 1 gen 2026 – 17 ago 2026
4. In cima alla pagina cambiare «Periodo» (export corrispettivi/KPI) da «Ultimi 30 giorni» a «Ultimi 7 giorni»
5. Rileggere il valore di «Periodo grafici»

**Atteso:** «Periodo grafici» resta su «Anno corrente». Il pannello lo scrive di suo pugno: «Filtro indipendente dal periodo KPI ed export corrispettivi.»

**Osservato:** «Periodo grafici» torna a «Ultimi 7 giorni», cioè al periodo dei KPI: la scelta dell'operatore viene persa senza alcun segnale. Causa: <app-business-analytics-charts> vive dentro il ramo @if (summary(); as data) del pannello; al cambio periodo il pannello passa allo stato `loading`, il componente grafici viene distrutto e ricreato, e l'effect di inizializzazione (`filtersInitialized`) riparte da capo prendendo il nuovo `initialPeriod`.

**Evidenza:** Test T5b in e2e-local/20-dashboard-report.spec.ts (fallisce, riprodotto in 2 esecuzioni). Output:
[T5b] testo pannello grafici: … (19 lug 2026 – 17 ago 2026) . Filtro indipendente dal periodo KPI ed export corrispettivi. Periodo grafici Ultimi 30 giorni
[T5b] periodo grafici scelto: "Anno corrente"
[T5b] periodo grafici dopo il cambio KPI: "Ultimi 7 giorni"
Screenshot: docs/test-results/screenshots-local/T5b-grafici-anno.png e T5b-grafici-azzerati.png

**Verifica indipendente:** Riprodotto 2 volte con script indipendente (V2). Sequenza: /app/reports?period=30d → «Periodo grafici» impostato a «Anno corrente» (verificato applicato) → cambio del periodo KPI da «Ultimi 30 giorni» a «Ultimi 7 giorni» tramite il select «Periodo export corrispettivi» → «Periodo grafici» rilegge «Ultimi 7 giorni». Non torna al proprio default (che sarebbe «Ultimi 30 giorni»): si allinea esattamente al nuovo periodo KPI, il che conferma la diagnosi dell'agente originale — <app-business-analytics-charts> sta dentro il ramo @if (summary(); as data) del pannello, il passaggio a `loading` lo distrugge e l'effect di init (filtersInitialized) riparte prendendo il nuovo initialPeriod.

---

### P2.15 · Senza il permesso «Esportare dati» la pagina Report perde l'unico selettore di periodo dei KPI: la Performance commerciale resta inchiodata a 30 giorni

**Area:** Dashboard, Report · **Tipo:** ux · **Spec:** `src/app/features/reports/reports.component.html:7-37`

**Passi**

1. Utente con «Consultare report» (section.reports) ma SENZA «Esportare dati» (reports.export) — simulato riscrivendo la risposta di /auth/me lato client (role=manager, permissions=['section.reports']); API e database non toccati
2. Aprire /app/reports
3. Attendere il pannello «Performance commerciale» (8 KPI caricati correttamente)
4. Cercare un modo per cambiare il periodo dei KPI

**Atteso:** Nascondere il blocco «Export corrispettivi» è giusto (è un'azione riservata), ma il pannello KPI deve conservare un proprio selettore di periodo — come lo ha sulla Dashboard, dove lo stesso componente mostra il controllo segmented 7 giorni/30 giorni/Mese/…

**Osservato:** Con il blocco export sparisce anche l'unico controllo del periodo dei KPI: il pannello è montato con [hidePeriodFilter]="true" e riceve il periodo dal blocco export, che non esiste più. In pagina resta un solo controllo, «Periodo grafici analytics», che governa soltanto i grafici. Il sottotitolo continua però a dire «per il periodo selezionato (19 lug 2026 – 17 ago 2026)»: fatturato, margine, pezzi venduti e previsione restano fissi su 30 giorni e l'unico modo di cambiarli è scrivere ?period=year a mano nella barra degli indirizzi.

**Evidenza:** Test T14 in e2e-local/20-dashboard-report.spec.ts (fallisce, riprodotto in 3 esecuzioni). Output:
[T14] blocco export=false · segmented KPI=false · selettore grafici=true
[T14] controlli nella pagina Report: ["Periodo grafici analytics"]
[T14] sottotitolo pannello: Fatturato, margini e previsioni per il periodo selezionato (19 lug 2026 – 17 ago 2026) …
[T14] KPI mostrati: {"Fatturato":"1708,00 €",…,"Sotto soglia":"9"} · stato pannello: {"skeleton":0,"errore":"","statCard":8}
Screenshot: docs/test-results/screenshots-local/T14-report-senza-permesso-export.png

**Verifica indipendente:** Riprodotto 2 volte con simulazione mia e indipendente (V3): intercettazione client-side di GET /api/v1/auth/me con role=manager e permissions=['section.reports'] — API e database mai toccati. Misurato: blocco export = 0 (quindi il permesso è stato tolto davvero, il setup ha preso), app-segmented dentro il pannello KPI = 0, stat-card = 8 (i KPI caricano e mostrano dati), e l'unico controllo con «periodo» nell'aria-label è «Periodo grafici analytics», che governa i soli grafici. Confermata anche la realtà dello scenario, che era il dubbio principale: reports.export è un permesso assegnabile a sé (tenant-permission.model.ts:224, etichetta «Esportare dati», ed è dentro SENSITIVE_ACTION_PERMISSIONS), distinto da section.reports; solo il ruolo Owner ha hasFullTenantAccess. Un titolare può quindi configurare esattamente questo caso dall'editor permessi. La causa è strutturale in reports.component.html: [hidePeriodFilter]="true" è incondizionato e il selettore vive nel blocco @if (canExportCorrispettivi()).

---

### P2.16 · Il documento Inventario viene creato e confermato ma non viene mai collegato alla sessione: il link «Apri documento inventario generato →» non compare mai

**Area:** Movimenti · **Tipo:** bug · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. Completa una sessione inventario come sopra (fino a «Applica rettifiche»).
2. Ricarica la pagina di dettaglio della sessione.
3. GET /inventory/counts/<id> e GET /documents?type=inventory.

**Atteso:** session.documentId valorizzato e link al documento Inventario nella testata della sessione (il template lo prevede: `@if (s.documentId)`).

**Osservato:** session.documentId resta null anche dopo il reload, quindi il link non compare mai. Il documento però esiste ed è confermato: INV-0005, notes «Inventario fisico: E2E-MOV-Inventario-4368905», internalComment «Sessione inventario 68ddf992-…». Il collegamento sessione→documento si perde in modo permanente: la tracciabilità richiesta dalla schermata è irrecuperabile senza intervento sui dati. Stessa causa del P1: l'update `documentId` sta dopo la confirm() che solleva l'eccezione. Osservato su 5 sessioni su 5 (INV-0001…INV-0005, tutte con documentId null).

**Evidenza:** docs/test-results/screenshots-local/mov-inventario-senza-link-documento.png. Output test: «[inventario] link documento presente dopo reload: false» · «[inventario] documento inventario a sistema: INV-0005 (9732f47e-dd35-4921-89e9-48f58723a115)» · «[residui] documenti inventario: 5 → [INV-0005 … INV-0001]» con tutte le sessioni a documentId=null.

**Verifica indipendente:** Riprodotto. Dopo la chiusura e dopo il reload della pagina di dettaglio: session.documentId = null e nessun elemento .count-detail__document-link a in pagina. Il documento però esiste: GET /documents?type=inventory restituisce INV-0006 (e8a798a3-b0df-4e88-b17b-88e413497853) status=confirmed, con notes contenente il nome della mia sessione. Il template lo prevede (@if (s.documentId) in inventory-count-detail.component.html) ma la condizione non è mai vera. Stessa radice del P1: l'update di documentId (inventory-count.service.ts:347-350) sta DOPO la confirm() che solleva l'eccezione, quindi non viene mai eseguito. Anche la mia sessione di controllo, chiusa con successo (201), ha documentId=null — lì però perché senza differenze non c'è documento, il che è corretto.

---

### P2.17 · La rettifica generata dalla chiusura inventario è attribuita a «Automatico», non all'operatore che l'ha applicata

**Area:** Movimenti · **Tipo:** dato-incoerente · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. Chiudi una sessione inventario con almeno una differenza (passi del P1).
2. Vai in /app/inventory/movements e cerca lo SKU contato.
3. Guarda la colonna «Operatore» della riga con causale «Inventario fisico: …».

**Atteso:** L'operatore che ha premuto «Applica rettifiche» (qui «Domenico SG»), come per ogni altra rettifica manuale. §20.4 chiede data, operatore e origine per ogni variazione; regole-gestionale §AUDITABILITÀ UI chiede «chi ha eseguito l'azione» proprio per rettifiche e movimenti.

**Osservato:** Il movimento nasce con createdByName='API' e createdById non valorizzato (api/src/inventory/inventory-count.service.ts finalize), e la lista lo traduce in «Automatico» (MOVEMENT_ACTOR_LABELS). Riga letta a schermo: [«17 ago 2026, 21:21», «Rettifica», «E2E-MOV-SKU-4368905», «E2E-MOV-Articolo-4368905», «+2», «Test SG», «Inventario fisico: E2E-MOV-Inventario-4368905», «Automatico»]. Una rettifica decisa e autorizzata da una persona viene quindi presentata come movimento automatico, e il filtro «Operatore» non permette di risalire a chi l'ha fatta. Stesso difetto sulla sessione stessa: create() la scrive con createdByName 'API'.

**Evidenza:** docs/test-results/screenshots-local/mov-inventario-movimento-in-lista.png. Output test: «[inventario] movimento: qta=2 direzione=increase operatore=«API» origine=manual» · «[inventario] colonna Operatore in lista: «Automatico»». Confronto: i movimenti registrati dal form manuale riportano correttamente «Domenico SG».

**Verifica indipendente:** Riprodotto. Il movimento generato dalla chiusura ha createdByName='API' e createdById=null (letto via GET /inventory/movements?variantId=...). In lista la riga è: [«17 ago 2026, 21:32», «Rettifica», «E2E-VER-SKU-022742», «E2E-VER-Art-022742», «+2», «Test SG», «Inventario fisico: E2E-VER-Inv-120035», «Automatico»]. Controllo di confronto nello stesso test: i due carichi registrati dal form manuale, dallo stesso utente e nella stessa sessione di browser, riportano «Domenico SG». Confermato anche nel codice: inventory-count.service.ts:297 scrive createdByName: 'API' fisso e non passa createdById, benché finalize() riceva l'oggetto user.

---

### P2.18 · I filtri della lista Movimenti non vivono nell'URL: ricaricare la pagina li azzera tutti

**Area:** Movimenti · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. /app/inventory/movements.
2. Imposta «Tipo movimento» = Carico (la tabella si filtra correttamente: GET …&type=load, 20 righe su 27, tutte Carico).
3. Guarda la barra degli indirizzi.
4. Ricarica la pagina (F5).

**Atteso:** §20.10 del documento funzionale: «I filtri di lista vivono nell'URL: ricaricare la pagina mantiene la vista». È anche il comportamento di tutte le altre liste dell'app (prodotti, documenti, ordini fornitore sincronizzano i filtri in query param).

**Osservato:** L'URL resta «http://localhost:4200/app/inventory/movements» senza alcun query param mentre il filtro è attivo. Dopo il reload il chip torna «Tipo movimento: Tutti» e la tabella mostra di nuovo tutti i tipi (Vendita, Rettifica, Scarico, Carico). Vale per tutti i filtri della schermata (tipo, origine, periodo, location, cliente/fornitore, operatore, ricerca): stock-movements.component.ts non legge né scrive queryParamMap per i filtri, li usa solo per aprire il form movimento. Conseguenza pratica: la vista non è condivisibile via link e ogni ricarica (o ritorno dal dettaglio con reload) fa ricominciare da capo il filtraggio.

**Evidenza:** docs/test-results/screenshots-local/mov-filtri-persi-dopo-reload.png. Output test: «[lista] GET filtrata → 200 total=27 query=page=1&pageSize=20&locationId=…&type=load» · «[lista] URL con filtro Tipo=Carico: http://localhost:4200/app/inventory/movements» · «[lista] dopo reload → chip «Tipo movimento: Tutti», tipi in tabella: Vendita, Rettifica, Scarico, Carico».

**Verifica indipendente:** Riprodotto. Con «Tipo movimento» = Carico il filtro funziona (tipi in tabella: solo «Carico») ma l'URL resta http://localhost:4200/app/inventory/movements, senza alcun query param. Dopo F5 il chip torna «Tipo movimento: Tutti» e la tabella mostra di nuovo Carico, Rettifica, Vendita, Reso, Scarico. Nota: il mio primo tentativo è fallito per un selettore ambiguo (il chip espone anche un pulsante «Azzera filtro»); corretto con exact:true, il difetto si è riprodotto identico — non era un artefatto del test. Verificata anche la premessa del segnalatore: 7 liste su 9 in features/ leggono queryParamMap (prodotti, documenti, clienti, fornitori, ordini fornitore, ordini cliente, vendite online); stock-movements.component.ts e inventory-count-list.component.ts sono gli unici a 0 occorrenze.

---

### P2.19 · L'automatismo «Inserisci nota nei documenti» del cliente non arriva su Ordine cliente, DDT vendita e Preventivo

**Area:** Clienti, impostazioni · **Tipo:** bug · **Spec:** `e2e-local/95-clienti-impostazioni.spec.ts`

**Passi**

1. /app/customers → aprire il cliente «E2E-CLI-Azienda» → Modifica.
2. Verificare che il campo «Inserisci nota nei documenti» contenga «E2E-CLI-NOTA automatica documento» (placeholder del campo: «Testo aggiunto automaticamente alle note del documento»). Salvare.
3. Aprire /app/documents/proforma/new e selezionare quel cliente dalla tendina Cliente → il campo «Note (visibili in stampa)» si popola con la nota.
4. Aprire /app/sales/new (Ordine cliente) e selezionare lo STESSO cliente → il campo «Note documento» (#co-notes) resta vuoto.
5. Ripetere il punto 4 su /app/documents/sales-ddt/new (DDT vendita) e /app/documents/quote/new (Preventivo): stesso esito.

**Atteso:** Il testo configurato in anagrafica finisce nelle note del documento su TUTTE le maschere di vendita, come promette l'etichetta del campo e come già accade su Proforma/Fattura/Nota di credito. L'altro automatismo della stessa scheda («Mostra avviso alla creazione documento») funziona correttamente su tutte e quattro le maschere, quindi la differenza non è voluta né dichiarata da nessuna parte in UI.

**Osservato:** Note vuote su Ordine cliente, DDT vendita e Preventivo. L'avviso compare su tutte e quattro. Riprodotto 3 volte su 3 esecuzioni.

Causa individuata nel codice: src/app/features/sales-orders/customer-order-form.component.ts → applyCustomerDefaults() applica paymentTerms, paymentMethod, transportResponsible, indirizzi e customerDiscount, ma NON documentCreationNote; src/app/features/documents/sales-document-form.component.ts ha invece applyCustomerDocumentNote(). Nessun fallback lato API: in api/src il campo documentCreationNote viene solo letto/scritto (party-views.ts, customers.service.ts), mai applicato a un documento. La stessa maschera CustomerOrderFormComponent serve tre famiglie documentali (sales_order, sales_ddt, quote), quindi il buco vale per tutte e tre.

**Evidenza:** Output test (e2e-local/95-clienti-impostazioni.spec.ts, test «automatismi cliente: la nota anagrafica non arriva su Ordine cliente, DDT e Preventivo»):
[Ordine cliente] avviso=true note=""
[DDT vendita] avviso=true note=""
[Preventivo] avviso=true note=""
[Proforma] avviso=true note="Documento non fiscale / Proforma non valida ai fini IVA.\nE2E-CLI-NOTA automatica documento"

Screenshot: docs/test-results/screenshots-local/cli-nota-anagrafica-assente-Ordine-cliente.png, cli-nota-anagrafica-assente-DDT-vendita.png, cli-nota-anagrafica-assente-Preventivo.png (confronto: cli-automatismi-documento.png mostra la proforma che la riceve).

**Verifica indipendente:** Riprodotto con script indipendente (e2e-local/95-clienti-impostazioni-verifica.spec.ts, test D1), due esecuzioni su due, esito identico. Il cliente di partenza è stato verificato PRIMA via API (GET /api/v1/customers → documentCreationNote="E2E-CLI-NOTA automatica in documento"), quindi non è un dato di partenza anomalo. Esito: Proforma → note="Documento non fiscale / Proforma non valida ai fini IVA.\nE2E-CLI-NOTA automatica in documento"; Ordine cliente, DDT vendita e Preventivo → note="". Ho inoltre dumpato TUTTE le <textarea> di ogni maschera per escludere che la nota finisse in un altro campo: su co-notes la maschera ha una sola textarea ed è vuota. L'avviso («Mostra avviso alla creazione documento») compare su tutte e quattro, quindi il cliente è correttamente letto e la differenza riguarda solo la nota. Il codice conferma il meccanismo: src/app/features/documents/sales-document-form.component.ts ha applyCustomerDocumentNote(), mentre src/app/features/sales-orders/customer-order-form.component.ts:4062 applyCustomerDefaults() applica paymentTerms/paymentMethod/transportResponsible/indirizzi/customerDiscount e non tocca documentCreationNote; documents.routes.ts:264 e :294 confermano che sales-ddt/new e quote/new usano la stessa maschera dell'Ordine cliente.

---

### P2.20 · Ordine cliente: se si salva prima che arrivi la scheda articolo, il controllo di disponibilità non scatta e l'ordine impegna comunque

**Area:** Vendita al banco · **Tipo:** bug · **Spec:** `C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\e2e-local\90-vendite.spec.ts`

**Passi**

1. Login titolare, /app/sales/new. Compila Cliente e Location (finché mancano, le righe non compaiono).
2. Nel campo di scansione in fondo alla tabella digita `60*E2E-VEN-SKU-92254665` (articolo con 10 disponibili) e premi Invio.
3. La riga compare SUBITO con quantità 60, ma i dati d'articolo (nome, «Q.tà disp.», spunta «Impegna magazzino») arrivano con una seconda chiamata `GET /api/v1/products/variants/summaries`.
4. Prima che quella risposta arrivi, premi «Salva documento».
   (Nel test la finestra è resa deterministica ritardando di 5s la sola risposta `products/variants/summaries` con `page.route`; la stessa cosa è però capitata due volte SENZA alcun ritardo artificiale, su macchina locale, semplicemente salvando appena la quantità compariva a schermo.)

**Atteso:** §12.2 / §20.5: «se una riga supera la disponibile compare un riepilogo delle righe critiche con scelta Salva comunque». Il riepilogo «Quantità oltre la disponibilità» deve comparire sempre, anche se la scheda articolo arriva tardi (o non arriva: `pinVariantSummary` non ha nemmeno un ramo d'errore).

**Osservato:** Nessun dialogo, nessun avviso: l'ordine viene salvato in silenzio e impegna 60 pezzi su 10 disponibili — giacenza 10, impegnata 60, disponibile −50. Causa: `commitsStock` nasce a `true` in `createLine()`, mentre `lineEffectiveAvailable()` restituisce `null` finché la summary non è arrivata; `lineExceedsAvailability()` esce quindi `false` e `collectAvailabilityIssues()` non produce nulla. Il controllo non fallisce: semplicemente non c'è.

**Evidenza:** Test `ordine cliente: DIFETTO — salvando prima che arrivi la scheda articolo il controllo disponibilità non scatta`. Output ripetuto in tre esecuzioni:
«RIGA IN ATTESA — prodotto: ""» · «DIALOG DISPONIBILITÀ VISTO? false» · «LIVELLO DOPO SALVA SENZA AVVISO {onHand:10, available:-50, committed:60}» (url /app/sales/<id>/edit).
Controprova: con l'attesa del nome articolo il dialogo compare regolarmente — test `ordine cliente: oltre la disponibile mostra il riepilogo con «Salva comunque»` → «DIALOG DISPONIBILITÀ Quantità oltre la disponibilità».
Screenshot: C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\docs\test-results\screenshots-local\ven-ordine-controllo-disponibilita-saltato.png

**Verifica indipendente:** Riprodotto in tre modi diversi con script indipendente (e2e-local/91-ordine-cliente-verifica.spec.ts), sempre su articolo mio con disponibile 0 e riga da 60 pezzi. (1) CONTROLLO — attendendo davvero l'arrivo della scheda articolo il riepilogo compare regolarmente («CONTROLLO — DIALOGO DISPONIBILITA VISTO? true», riga a schermo «disponibili solo 0»): il test non sbaglia selettore, il controllo esiste e funziona. (2) CORSA con ritardo di 8s sulla sola `products/variants/summaries`: nessun dialogo, ordine salvato, livello {onHand:0, available:−60, committed:60}. (3) SENZA alcun ritardo artificiale, premendo Salva 48 ms dopo Invio: identico, la summary non era ancora partita. Ho inoltre verificato l'aggravante che il segnalatore ipotizzava: intercettando la summary con `route.abort` e attendendo 10 secondi pieni — nessuna corsa, la scheda semplicemente non arriva mai — il dialogo continua a non comparire e l'ordine impegna 60 su 0; all'operatore non compare alcun errore in maschera (solo un'eccezione in console/observability). Il meccanismo è quello descritto: `commitsStock` nasce `true`, `lineEffectiveAvailable()` (customer-order-form.component.ts:2646) restituisce `null` finché `lineVariantSummary` è vuota, `lineExceedsAvailability()` esce `false` e `collectAvailabilityIssues()` non produce nulla; `pinVariantSummary` (riga 2560) non ha ramo d'errore.

---

### P2.21 · Ricezione parziale: ricevuti 2 di 4, l'ordine si chiude e i 2 pezzi residui non sono più ricevibili da nessun percorso

**Area:** Fornitori · **Tipo:** bug · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. /app/orders/new → Fornitore «E2E-FOR-Fornitore», Sede «Test SG», Aggiungi riga, SKU «E2E-FOR-SKU-1» + Invio, Q.tà 4, Costo 10 → «Salva documento».
2. Dettaglio ordine → «Crea arrivo merce» → conferma il dialogo.
3. Nell'arrivo merce la riga esce con Ord. 4 / Ric. 0 / Res. 4 e Q.tà 4: si cambia la Q.tà in 2 (ricezione parziale).
4. «Salva documento», si attende che la maschera passi a /app/documents/<id>/edit.
5. Si riapre l'ordine e si prova a riceverne il residuo: /app/documents/goods-receipt/new → si sceglie lo stesso fornitore e la stessa sede.

**Atteso:** Caricati 2 pezzi e ordine ancora ricevibile per i 2 residui (l'ordine espone Ord./Ric./Res. e `receivedQuantity`, e il pannello «Includi ordine» promette che «le righe residue verranno aggiunte»).

**Osservato:** La giacenza sale correttamente di 2, la riga ordine resta ordinata=4 ricevuta=2, ma lo stato dell'ordine passa comunque a `concluded`. Da lì l'ordine non compare più in nessun percorso di ricezione: `loadReceivableOrders` (goods-receipt-form.component.ts) filtra `status === Confirmed`, e su un ordine Concluso il dettaglio non offre più «Crea arrivo merce» (unica azione: «Scarica PDF»). I 2 pezzi ordinati e non ricevuti restano fuori dal flusso: per registrarli serve un ordine nuovo.

**Evidenza:** Output test (3 esecuzioni concordi, l'ultima con attesa esplicita della navigazione): «[parziale] documento salvato: http://localhost:4200/app/documents/5adf109b-.../edit» · «[parziale] giacenza 0 → 2 · stato ordine=concluded · ordinata=4 ricevuta=2» · «[parziale] ordine OF-0001 ancora includibile in un nuovo arrivo: false». Screenshot: docs/test-results/screenshots-local/for-arrivo-parziale.png. Nota: DOCUMENTO-FUNZIONALE §9.2 documenta la chiusura all'aggancio, ma la stessa UI espone colonne Ord./Ric./Res. e un residuo che poi non è utilizzabile.

**Verifica indipendente:** Riprodotto due volte su script indipendente (e2e-local/70-fornitori-ordini-verifica.spec.ts, test D1) con dati miei (E2E-VER-FOR): ordine di 4 pezzi, arrivo merce creato da ?supplierOrderId=…, q.tà portata a 2, salvato. Esito identico nei due giri: «[D1] stato ordine=concluded · ordinata=4 ricevuta=2» e «[D1] azioni sul dettaglio ordine: Scarica PDF» — «Crea arrivo merce» sparisce (canCreateGoodsReceipt richiede status===Confirmed) e loadReceivableOrders filtra anch'esso Confirmed, quindi il residuo di 2 non è più agganciabile. Contro-prova D1-bis: riaprendo l'arrivo merce salvato le colonne ci sono davvero (ORD. | RIC. | RES.) ma il documento è in sola lettura («Sblocca modifica») e la q.tà non è modificabile.

---

### P2.22 · Allegati dell'ordine fornitore: il pannello va sempre in errore — il frontend chiama /sales-orders/:id/attachments e l'endpoint per gli ordini fornitore non esiste

**Area:** Fornitori · **Tipo:** bug · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. Aprire un ordine fornitore salvato: /app/orders/<id>/edit.
2. Scorrere fino alla sezione «Allegati» (compare solo su ordine già salvato).

**Atteso:** Elenco vuoto («Nessun allegato») e caricamento allegato funzionante, come sugli altri documenti.

**Osservato:** Il pannello mostra sempre lo stato d'errore «Si è verificato un errore — Impossibile caricare gli allegati / Riprova». Il frontend chiama `GET /api/v1/sales-orders/<idOrdineFornitore>/attachments` → 404 {"message":"Ordine non trovato"}. La rotta corretta non esiste affatto: `GET /api/v1/supplier-orders/<id>/attachments` → 404 «Cannot GET». Causa in `src/app/core/services/attachments-api.service.ts`, metodo privato `baseUrl()`: `const segment = entityType === 'document' ? 'documents' : 'sales-orders';` — l'entityType `supplier_order` passato dal form ordine finisce su sales-orders. Il pulsante «Carica allegato» resta cliccabile, quindi la funzione è offerta ma non esiste.

**Evidenza:** Screenshot: docs/test-results/screenshots-local/for-ordine-allegati-errore.png. Log test: «[API 404] GET http://localhost:3000/api/v1/sales-orders/6f224018-13fe-4265-acc2-553f531c8649/attachments :: {"message":"Ordine non trovato","error":"Not Found","statusCode":404}» e «[API 404] GET .../supplier-orders/6f224018-.../attachments :: {"message":"Cannot GET ..."}». Riprodotto in tutte le esecuzioni.

**Verifica indipendente:** Riprodotto due volte (test D2) con sonda API diretta oltre che via UI. «GET /sales-orders/<idOrdineFornitore>/attachments → 404 {"message":"Ordine non trovato"}» e «GET /supplier-orders/<id>/attachments → 404 {"message":"Cannot GET …"}»: la rotta giusta non esiste proprio. Il pannello mostra «Allegati · Carica allegato · Si è verificato un errore · Impossibile caricare gli allegati. Riprova» e ogni apertura lascia 3 errori console 404. Causa verificata in sorgente: src/app/core/services/attachments-api.service.ts, baseUrl() → «const segment = entityType === 'document' ? 'documents' : 'sales-orders';» mentre supplier-order-form.component.html:1138 passa entityType="supplier_order"; api/src/supplier-orders/supplier-orders.controller.ts non ha alcuna rotta :id/attachments (le uniche :id/attachments dell'area stanno su suppliers.controller.ts, cioè l'anagrafica fornitore).

---

### P2.23 · Il pulsante «Includi ordine» non compare mai su un nuovo Arrivo merce: il flusso (b) di §9.1 è irraggiungibile

**Area:** Fornitori · **Tipo:** bug · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. /app/documents/goods-receipt/new (arrivo merce nuovo, senza query param).
2. Selezionare Fornitore «E2E-FOR-Fornitore» e Location destinazione «Test SG» in testata.
3. Guardare gli strumenti sopra la tabella righe.

**Atteso:** Compare il pulsante «Includi ordine» che apre il pannello degli ordini fornitore ricevibili (DOCUMENTO-FUNZIONALE §9.1 punto 3, modalità (b)).

**Osservato:** Gli strumenti restano «Colonne | Cod. a barre | Importa CSV | Nuovo prodotto | Aggiungi riga»: «Includi ordine» non compare, nemmeno con fornitore e sede valorizzati e con ordini Confermati di quel fornitore in archivio. Causa probabile in `goods-receipt-form.component.ts`: `canIncludeSupplierOrder = computed(() => ... && Boolean(this.form.controls.supplierId.value))` legge un valore di Reactive Form, che non è un signal — il computed non viene mai invalidato dalla scelta del fornitore e resta al `false` calcolato al primo render. Di conseguenza si può agganciare un ordine solo partendo dal dettaglio ordine («Crea arrivo merce»). Nota accessoria: il testo del pannello parla ancora di «un ordine inviato o parzialmente ricevuto» e «Non ci sono ordini inviati», stati che non esistono più.

**Evidenza:** Log test: «[parziale] testata arrivo merce: fornitore="E2E-FOR-Fornitore" sede="Test SG"» seguito da «[parziale] strumenti righe: Colonne | Cod. a barre | Importa CSV | Nuovo prodotto | Aggiungi riga». Verificato anche con una sonda dedicata che elenca tutti i <button> della pagina prima e dopo la scelta del fornitore: «[probe] «Includi ordine» presente: false». Screenshot: docs/test-results/screenshots-local/for-arrivo-nuovo-strumenti-righe.png.

**Verifica indipendente:** Riprodotto due volte (test D3) e rinforzato da una contro-prova dedicata (D3-bis) costruita apposta per smentirlo. Con Fornitore ed entrambi i campi valorizzati («[D3] testata: fornitore="E2E-VER-FOR-Fornitore" location="Test SG"») e con 2 ordini Confermati di quel fornitore in archivio, gli strumenti restano «Colonne | Cod. a barre | Importa CSV | Nuovo prodotto | Aggiungi riga», identici a prima della selezione. D3-bis: «dopo 15s di attesa: false», «dopo «Aggiungi riga»: false», «dopo il toggle «Cod. a barre» (che muove un signal): false». Il flusso (b) documentato in §9.1 punto 3 è quindi irraggiungibile: si può agganciare un ordine solo dal dettaglio ordine (flusso c).

---

### P2.24 · Arrivo merce creato da ordine: la riga importata porta lo SKU al posto del nome articolo (in «Nome prodotto» e in «Descrizione»)

**Area:** Fornitori · **Tipo:** bug · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. Creare un ordine fornitore con una riga sull'articolo «E2E-FOR-Articolo» (SKU E2E-FOR-SKU-1): la riga d'ordine salva `description: "E2E-FOR-Articolo"`.
2. Dettaglio ordine → «Crea arrivo merce» → confermare il dialogo.
3. Guardare la colonna «Nome prodotto» della riga importata.

**Atteso:** «Nome prodotto» = «E2E-FOR-Articolo», cioè la descrizione che l'ordine porta con sé.

**Osservato:** «Nome prodotto» e «Descrizione» valgono «E2E-FOR-SKU-1»: al posto del nome c'è il codice. In `goods-receipt-form.component.ts`, `createLineFromSupplierOrderLine()` imposta `productName: this.fb.control(orderLine.sku)` e `description: this.fb.control(orderLine.sku)`, ignorando `orderLine.description`. Il valore è una descrizione di riga che viene salvata sul documento e finisce anche in stampa: l'arrivo merce nato da un ordine mostra un codice dove l'operatore si aspetta il nome, mentre lo SKU è già in una colonna sua.

**Evidenza:** Log test: riga d'ordine via API «"sku":"E2E-FOR-SKU-1","description":"E2E-FOR-Articolo"» e, nell'arrivo merce, «[arrivo] nome prodotto sulla riga importata: "E2E-FOR-SKU-1"». Asserzione del test: «la riga importata dall ordine mostra lo SKU al posto del nome articolo — Expected: "E2E-FOR-Articolo", Received: "E2E-FOR-SKU-1"». Screenshot: docs/test-results/screenshots-local/for-arrivo-merce-precompilato.png.

**Verifica indipendente:** Riprodotto due volte (test D4/D6) con l'ordine creato via API con description esplicita: «[D4/D6] riga d'ordine sul server: sku="E2E-VER-FOR-SKU-1" description="E2E-VER-FOR-Articolo"» e, nell'arrivo merce precompilato, «riga 1: prodotto="E2E-VER-FOR-SKU-1"» con «descrizioni righe: ["","E2E-VER-FOR-SKU-1"]». Contro-prova D4-bis sul documento SALVATO, letto dal server: «righe documento salvate: [{"sku":"E2E-VER-FOR-SKU-1","description":"E2E-VER-FOR-SKU-1","qty":2}]» — il valore non resta a schermo, si persiste. Coerente con createLineFromSupplierOrderLine() che imposta productName e description a orderLine.sku ignorando orderLine.description.

---

### P2.25 · Il «Riepilogo IVA» dell'arrivo merce ignora lo sconto documento e contraddice l'IVA mostrata a fianco

**Area:** Documenti · **Tipo:** dato-incoerente · **Spec:** `e2e-local/80-documenti.spec.ts`

**Passi**

1. Vai su /app/documents/goods-receipt/new.
2. Fornitore «Test srl», Location destinazione «Test SG».
3. Riga 1: aggancia un articolo, quantità 10, costo 10,00.
4. Leggi la banda totali: Imponibile righe 100,00 € · Imponibile 100,00 € · IVA 22,00 € · Totale 122,00 €; il Riepilogo IVA dice «22 · 22% Imp. 100,00 € · IVA 22,00 €» (coerente).
5. Scrivi 10 nel campo «Sconto extra» (id gr-doc-discount) ed esci dal campo.
6. Rileggi la banda totali e il Riepilogo IVA sottostante.

**Atteso:** Con lo sconto documento del 10% i due blocchi restano coerenti: imponibile 90,00 €, IVA 19,80 €, e il riepilogo per aliquota che somma alla stessa IVA (o, se il riepilogo è volutamente ante-sconto, un'etichetta che lo dica).

**Osservato:** I totali si aggiornano correttamente (Sconto documento −10,00 € · Imponibile 90,00 € · IVA 19,80 € · Totale 109,80 €) ma il Riepilogo IVA resta fermo su «22 · 22% Imp. 100,00 € · IVA 22,00 €»: 2,20 € di scarto, senza alcuna etichetta che distingua i due valori. Il documento salvato porta l'IVA dei totali (verificato via API: subtotalMinor=10169, taxMinor=2237, totalMinor=12406 su una prova con 112,99 € di righe e 10% di sconto), quindi il Riepilogo IVA mostra un importo che non esiste in nessun documento. È il blocco che un contabile legge per la ripartizione per aliquota.

Nel codice la scelta è deliberata ma non comunicata: src/app/features/documents/goods-receipt-form.component.ts, commento su vatSummary — «Riepilogo IVA raggruppato per Codice (§10.2), prima dello sconto documento». La stessa maschera espone quindi due IVA diverse con la stessa etichetta.

**Evidenza:** Output del test «arrivo merce: il Riepilogo IVA deve concordare con l IVA del documento» (e2e-local/80-documenti.spec.ts:749):
[iva] senza sconto: ["Imponibile righe 100,00 €","Imponibile 100,00 €","IVA 22,00 €","Totale documento 122,00 €","Riepilogo IVA","22 · 22% Imp. 100,00 € · IVA 22,00 €"]
[iva] con sconto 10%: ["Imponibile righe 100,00 €","Sconto documento −10,00 €","Imponibile 90,00 €","IVA 19,80 €","Totale documento 109,80 €","Riepilogo IVA","22 · 22% Imp. 100,00 € · IVA 22,00 €"]
Error: il Riepilogo IVA (2200 cent) non corrisponde all IVA del documento (1980 cent)
Screenshot: C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\docs\test-results\screenshots-local\doc-riepilogo-iva-incoerente.png

**Verifica indipendente:** Riprodotto due volte con script indipendente (test D2) su /app/documents/goods-receipt/new, fornitore «E2E-CLI-Azienda», location «Test SG», una riga da 10 x 10,00. Senza sconto la banda dice: Imponibile righe 100,00 € · Imponibile 100,00 € · IVA 22,00 € · Totale 122,00 €, e il Riepilogo IVA «22 · 22% Imp. 100,00 € · IVA 22,00 €» (coerente). Con «Sconto extra» = 10 la banda diventa Sconto documento −10,00 € · Imponibile 90,00 € · IVA 19,80 € · Totale 109,80 €, mentre il Riepilogo IVA resta identico su Imp. 100,00 € · IVA 22,00 €: 2,20 € di scarto misurati (2200 centesimi contro 1980), senza alcuna etichetta che distingua i due valori. Verificato anche nel sorgente: goods-receipt-form.component.ts riga 2206 documenta la scelta («prima dello sconto documento») ma nulla lo dice a schermo, e vatSummary e documentTotals partono entrambi da lineVatAmounts — solo il secondo applica computeDocumentTotals con lo sconto.

---

## P3 — 28 difetti

### P3.1 · /cambia-password è aperta a chi non deve cambiare la password: schermata fuori dalla shell, senza via d'uscita e con un testo che dice il falso

**Area:** Autenticazione, shell · **Tipo:** ux · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Accedi normalmente come titolare (utente che NON ha l'obbligo di cambio password)
2. Vai a http://localhost:4200/cambia-password
3. Osserva la pagina e cerca un modo per tornare all'applicazione

**Atteso:** Chi non ha `mustChangePassword` acceso viene rimandato in dashboard, come il guard gemello fa in senso inverso su /app. In alternativa, se la schermata resta raggiungibile, deve avere un'uscita («Annulla» / «Torna all'applicazione») e un testo veritiero.

**Osservato:** La pagina si apre e mostra il form completo: h1 «Scegli la tua password», campi #change-password e #change-password-confirm, pulsante «Salva e continua». È fuori dalla shell (niente sidebar, niente topbar, niente breadcrumb) e nel template non esiste alcun link o pulsante di ritorno: l'unica uscita è il tasto Indietro del browser o riscrivere l'URL. Il sottotitolo afferma «La password che stai usando è stata scelta da chi ha creato il tuo account», che per questo utente è falso. La rotta ha solo authGuard (app.routes.ts) e il componente non verifica mustChangePassword. NON ho inviato il form.

**Evidenza:** Output del test:
[cambia-password] url=/cambia-password h1=«Scegli la tua password» form=true
Screenshot: docs/test-results/screenshots-local/auth-cambia-password-senza-obbligo.png

**Verifica indipendente:** Riprodotto due volte come titolare (che non ha mustChangePassword acceso): /cambia-password si apre, h1 «Scegli la tua password», #change-password e #change-password-confirm presenti, submit «Salva e continua». Ho enumerato a runtime tutti gli <a> e i <button> dentro <main>: link = [] (nessuno), bottoni = [toggle occhio, «Salva e continua»] — non esiste alcuna uscita, e la sidebar non è renderizzata (fuori dalla shell). Il sottotitolo recita «La password che stai usando è stata scelta da chi ha creato il tuo account», falso per questo utente. Verificato nel codice: in app.routes.ts la rotta ha solo `canActivate: [authGuard]`, mentre il guard gemello mustChangePasswordGuard è applicato solo al ramo /app. Non ho inviato il form.

---

### P3.2 · La scorciatoia in topbar mostra «⌘K» anche su Windows, dove il comando è Ctrl+K

**Area:** Autenticazione, shell · **Tipo:** ux · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Da Windows (o Linux) accedi e guarda la barra di ricerca globale in topbar
2. Leggi il tasto suggerito nel <kbd> a destra del segnaposto
3. Verifica che Ctrl+K apra comunque la palette

**Atteso:** regole-stile-ui §8 (Ricerca globale ⌘K): «Comando tastiera: ⌘K su Mac, Ctrl+K su Windows — indicato con kbd inline». Su Windows il suggerimento deve dire Ctrl K.

**Osservato:** Il <kbd> è la stringa fissa «⌘K» nel template (src/app/shared/components/app-topbar/app-topbar.component.html, riga 22: `<kbd class="app-topbar__search-kbd" aria-hidden="true">⌘K</kbd>`), senza alcuna scelta per piattaforma. Su Chrome/Windows 11 l'operatore vede il simbolo Command di macOS. La funzione è corretta — Ctrl+K apre davvero la palette e mette il fuoco sull'input — è solo il suggerimento a essere sbagliato. Nota: l'aria-label del pulsante dice invece «Ricerca globale (Ctrl K)», quindi lettore di schermo e occhio dicono due cose diverse.

**Evidenza:** Output del test su Desktop Chrome/Windows:
[topbar] {"menu":true,"search":"Cerca prodotti, ordini, clienti…","kbd":"⌘K",...}
[gsearch] aperta con Ctrl+K, focus su: «gsearch__input»

**Verifica indipendente:** Riprodotto due volte su Chrome/Windows (navigator.platform = Win32): il <kbd> in topbar legge «⌘K» mentre l'aria-label del pulsante dice «Ricerca globale (Ctrl K)» — occhio e lettore di schermo dicono due cose diverse. Verificato nel sorgente: app-topbar.component.html:22 contiene la stringa fissa `<kbd class="app-topbar__search-kbd" aria-hidden="true">⌘K</kbd>`, senza alcuna scelta per piattaforma. La funzione invece è a posto: Ctrl+K apre davvero la palette e il fuoco finisce su .gsearch__input. Diverge da regole-stile-ui §8, che chiede esplicitamente «⌘K su Mac, Ctrl+K su Windows».

---

### P3.3 · La sidebar non ha la voce «Ordini Fornitori» richiesta dalle regole di dominio

**Area:** Autenticazione, shell · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Accedi come titolare
2. Elenca le voci della sidebar (.app-sidebar__link)
3. Cerca «Ordini fornitori»
4. Apri /app/documents e cerca un collegamento a /app/orders

**Atteso:** regole-gestionale, sezione «Sidebar»: «La sidebar DEVE contenere almeno: Dashboard, Prodotti, Magazzino, Ordini Fornitori, Clienti, Report, Impostazioni».

**Osservato:** Le voci presenti sono: Dashboard, Prodotti, Magazzino, Fornitori, Documenti, Vendita al banco, Vendite online, Corrispettivi, Clienti, Report, Impostazioni, Guida (+ Esci nel piede). Manca «Ordini fornitori». La rotta esiste e funziona (/app/orders → h1 «Ordini Fornitori») ed è raggiungibile dall'hub Documenti con la card «Ordini fornitore — Gestiti dalla sezione Ordini fornitori.», quindi non è un link morto: è una scelta di architettura di navigazione (tutto ciò che è documento passa dall'hub) che però contraddice la regola scritta. Da riconciliare: o si aggiunge la voce, o si aggiorna regole-gestionale.

**Evidenza:** Output del test:
[sidebar] voci: Dashboard | Prodotti | Magazzino | Fornitori | Documenti | Vendita al banco | Vendite online | Corrispettivi | Clienti | Report | Impostazioni | Guida | Esci
[sidebar] voce «Ordini fornitori» presente: false
[sidebar] link a /app/orders dentro l'hub Documenti: ["/app/orders · «Ordini fornitoreGestiti dalla sezione Ordini fornitori.»"]
[sidebar] /app/orders diretto → /app/orders · h1=«Ordini Fornitori»

**Verifica indipendente:** Elenco letto due volte dai .app-sidebar__label: Dashboard, Prodotti, Magazzino, Fornitori, Documenti, Vendita al banco, Vendite online, Corrispettivi, Clienti, Report, Impostazioni, Guida (+ Esci). Nessuna voce che corrisponda a /ordini\s+fornitor/i. Verificato in shell-layout.component.ts:353-356 che la voce «Fornitori» punta a /app/suppliers (anagrafica), non a /app/orders. La rotta /app/orders esiste e risponde (h1 «Ordini Fornitori») ed è raggiungibile dall'hub Documenti e dalla ricerca globale, quindi non è un link morto. Resta la divergenza letterale con regole-gestionale, sezione Sidebar.

---

### P3.4 · Il breadcrumb del dettaglio prodotto dice «Dettaglio» invece del nome del prodotto, benché il meccanismo per farlo esista

**Area:** Autenticazione, shell · **Tipo:** ux · **Spec:** `e2e-local/10-auth-shell.spec.ts`

**Passi**

1. Accedi e apri /app/products
2. Clicca una riga qualsiasi della tabella per aprire il dettaglio
3. Leggi il breadcrumb in cima all'area contenuto

**Atteso:** «Prodotti › <nome del prodotto>», come già fa l'Arrivo merce e l'Ordine cliente. Il servizio dedicato esiste ed è documentato proprio così: BreadcrumbLabelService — «una pagina di dettaglio registra il "numero" leggibile dell'entità aperta … così il breadcrumb mostra quello invece del generico «Dettaglio»».

**Osservato:** Il breadcrumb mostra ["Prodotti", "Dettaglio"]: con più schede aperte o tornando indietro non si capisce quale prodotto si stia guardando. `bindBreadcrumbEntityLabel` è chiamato solo da goods-receipt-form.component.ts e customer-order-form.component.ts — le altre pagine di dettaglio (prodotti, clienti, fornitori) restano sul fallback. Non è una rottura: è un'adozione ferma a metà. Il resto del breadcrumb funziona bene (link intermedio «Prodotti» riporta a /app/products, /app/settings/codici-iva → ["Impostazioni","Codici IVA"]).

**Evidenza:** Output del test:
[crumb] elenco prodotti: ["Prodotti"]
[crumb] dettaglio prodotto (/app/products/1ec69f91-…): ["Prodotti","Dettaglio"]
[crumb] link intermedio → /app/products
[crumb] codici IVA: ["Impostazioni","Codici IVA"]

**Verifica indipendente:** Riprodotto con i selettori reali (nav.breadcrumbs .breadcrumbs__item): elenco = ["Prodotti"]; aperto il dettaglio /app/products/dbe63551-... il breadcrumb resta ["Prodotti","Dettaglio"] mentre l'h1 della pagina mostra il nome vero del prodotto (E2E-PFRM-RAPIDO-560012-MOD) — l'informazione è già lì, il breadcrumb non la usa. Controprova a posto: /app/settings/codici-iva dà ["Impostazioni","Codici IVA"]. Il meccanismo esiste ed è documentato proprio per questo caso (breadcrumb-label.service.ts, commento: «mostra quello invece del generico Dettaglio»).

---

### P3.5 · Se il salvataggio delle preferenze colonne fallisce, nessun avviso: la scelta resta a schermo e sparisce al reload successivo

**Area:** Prodotti: lista · **Tipo:** ux · **Spec:** `e2e-local/30-prodotti-lista.spec.ts`

**Passi**

1. Vai su /app/products, apri «Colonne», premi «Ripristina colonne» per partire dal default.
2. Simula rete instabile facendo fallire la sola PUT /api/v1/users/me/table-views/products_list (nel test: route.abort('connectionfailed')).
3. Apri «Colonne» e spunta «Codice articolo»: la colonna compare subito in tabella.
4. Guarda la pagina: nessun toast, nessun banner, nessun testo di errore.
5. Ricarica la pagina.

**Atteso:** O il salvataggio riesce, o l'operatore viene avvisato che la preferenza non è stata salvata (regole-gestionale §Offline / rete instabile: «Se il fetch fallisce o la sync non riesce, mostrare stato non bloccante: banner, toast, badge di sync»).

**Osservato:** Zero feedback: 0 elementi con role=status/alert, nessuna occorrenza di «non salvat/non riuscit/errore» nel testo della pagina. La colonna resta visibile per tutta la sessione, quindi l'operatore crede di aver salvato. Al reload la colonna sparisce senza spiegazione, perché `hydrateFromServer` sovrascrive incondizionatamente lo stato locale (corretto, in localStorage) con quello del server (vecchio) — vedi `src/app/shared/table-columns/table-column-preference.service.ts:162-187`. L'errore viene ingoiato a monte da `catchError(() => of(undefined))` in `src/app/shared/table-columns/table-view-preference-api.service.ts:36-46`. Lo stesso esito si è presentato spontaneamente, senza simulazione, con due spunte ravvicinate: il server è rimasto allo stato della prima PUT e al reload la seconda scelta era persa (nessun ordinamento/sequenziamento fra PUT concorrenti).

**Evidenza:** Test `colonne: salvataggio preferenza fallito → nessun avviso e scelta persa al reload` (e2e-local/30-prodotti-lista.spec.ts:332). Output: `[colonne offline] PUT bloccate: 1`, `[colonne offline] feedback in pagina: {"toast":0,"testo":[]}`, `[colonne offline] dopo reload: ["Seleziona tutti","Nome","Venditore/Brand","Categoria","Stagione","Varianti","Stato","Origine","Etichetta"]` (senza «Codice articolo»). Console: `[observability] exception HttpErrorResponse {url: .../users/me/table-views/products_list, method: PUT, status: 0}` — l'errore è noto al codice, non all'utente. Screenshot: docs/test-results/screenshots-local/plst-colonne-salvataggio-fallito.png.

**Verifica indipendente:** Riprodotto due volte (test V3), con esito identico. Bloccando la sola `PUT /api/v1/users/me/table-views/products_list` con `route.abort('connectionfailed')`: `PUT bloccate: 1`, la colonna «Codice articolo» compare subito in tabella (`colonna visibile subito: 1`), e la pagina non dà alcun segnale — `elementi role=status/alert/banner: 0`, nessuna occorrenza di «non salvat / non riuscit / errore / riprova» nel testo. Dopo il reload (con la rotta ripristinata) la colonna è sparita (`colonna visibile dopo reload: 0`). L'errore è noto al codice ma non all'utente: in console `[observability] exception HttpErrorResponse {url: .../users/me/table-views/products_list, method: PUT, status: 0}`. Confermata anche la causa: `catchError(() => of(undefined))` in `table-view-preference-api.service.ts:34-46` ingoia l'errore e `hydrateFromServer` in `table-column-preference.service.ts:162-187` sovrascrive lo stato locale con quello del server.

---

### P3.6 · L'export CSV del catalogo non ha la colonna costo: il round-trip export→import azzera i costi d'acquisto

**Area:** Prodotti: lista · **Tipo:** bug · **Spec:** `e2e-local/30-prodotti-lista.spec.ts`

**Passi**

1. Vai su /app/products/import e importa un CSV con la colonna «Cost per item» valorizzata (es. Variant Price 40.00, Cost per item 17.50).
2. Apri il dettaglio dell'articolo importato: «Costo di riferimento» = 17,50 € e la riga variante mostra costo 17,50 €.
3. Torna in lista, filtra su quell'articolo e premi «Esporta CSV».
4. Apri il file scaricato.

**Atteso:** Il costo importato torna nell'export, così che export→import sia un round-trip senza perdite. Il parser di import lo prevede esplicitamente (alias «Cost per item», «Variant Cost», «Costo», «Costo d'acquisto») e il commento in `api/src/products/import/shopify-csv.mapper.ts:25-30` motiva perché serve: «senza, un catalogo importato nasce con i costi vuoti e i report non tornano».

**Osservato:** Il CSV esportato non ha nessuna colonna di costo e il valore 17.50 non compare da nessuna parte. `SHOPIFY_PRODUCT_EXPORT_HEADERS` in `api/src/products/import/shopify-csv.serialize.ts:18-40` elenca 23 colonne e nessuna riguarda il costo, pur dichiarando in commento di servire «al round-trip export→import». Chi esporta il catalogo per lavorarci in foglio e reimportarlo azzera i costi di tutte le varianti, e con essi margini e valorizzazione di magazzino. Nota accessoria emersa nello stesso file: l'Handle esportato viene ri-derivato dal titolo (`e2e-plst-import-cost-93874943`) invece di riportare l'import_handle memorizzato (`e2e-plst-cost-93874943`).

**Evidenza:** Test `CSV: il costo importato non torna nell'export (round-trip)` (e2e-local/30-prodotti-lista.spec.ts:844). Output: `[costo] riga variante (SKU, prezzo, costo, barcode): ["E2E-PLST-COST-93874943","M","40,00 €","17,50 €","—","Stampa"]`; `[costo] header export: Codice articolo,Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Price,Variant Compare-at Price,Variant Barcode,Image Src,Image Alt Text,Image Position,SEO Title,SEO Description`; `[costo] riga export: E2E-PLST-C93874943,e2e-plst-import-cost-93874943,E2E-PLST-Import-COST-93874943,,E2E-PLST-Brand,,,TRUE,Taglia,M,,,,,E2E-PLST-COST-93874943,40.00,,,,,,,`.

**Verifica indipendente:** Riprodotto (test V4) scaricando davvero il file dal pulsante «Esporta CSV». Header ottenuto: `Codice articolo,Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Price,Variant Compare-at Price,Variant Barcode,Image Src,Image Alt Text,Image Position,SEO Title,SEO Description` — `header contiene una colonna di costo? false`. Asimmetria confermata nel codice: l'import riconosce il costo (`api/src/products/import/shopify-csv.parse.ts:26,58` — «Cost per item» e alias localizzati, poi `shopify-csv.mapper.ts:187,337` che lo scrive su `purchasePrice`), mentre `SHOPIFY_PRODUCT_EXPORT_HEADERS` in `shopify-csv.serialize.ts:17-40` non ha nessuna colonna di costo, e nessun parametro dell'export la abilita (`export-products.query.dto.ts` non ha opzioni di costo).

---

### P3.7 · Contrasto sotto AA nell'intestazione della tabella prodotti (4.31:1) e nei testi della pagina Import (3.04:1): il token --color-table-header-fg non viene usato

**Area:** Prodotti: lista · **Tipo:** a11y · **Spec:** `e2e-local/30-prodotti-lista.spec.ts`

**Passi**

1. Vai su /app/products ed esegui axe-core sulla pagina.
2. Ripeti su /app/products/import.

**Atteso:** Contrasto testo ≥ 4.5:1 (regole-architettura §Accessibilità, AA). Per l'intestazione tabella regole-stile-ui §2 prescrive «Testo header tabella #3f4c51 → --color-table-header-fg» su fondo #e9edee, che darebbe ~7,5:1.

**Osservato:** axe segnala 8 violazioni serious «color-contrast» sulla lista e 5 sull'import. Quelle di quest'area: intestazioni ordinabili «Ordina per categoria/stagione/stato» e le colonne Varianti/Origine → 4.31:1 (#657075 su #e9edee); label «Copie per etichetta» → 4.45:1; su /app/products/import il paragrafo introduttivo `.product-import__intro` → 3.04:1 e l'hint del riquadro upload `.product-import__upload-hint` → 3.2:1. Causa dell'header tabella: `src/app/features/products/components/product-table/product-table.component.scss:50` usa `color: var(--color-text-muted)` (#657075) invece del token dedicato. `--color-table-header-fg` è dichiarato in `src/styles/_design-tokens.scss:128` ma nell'intera app è usato in un solo punto (`src/styles/_document-form.scss:1890`): tutte le liste divergono dalla specifica visiva.

**Evidenza:** Test `a11y: nessuna violazione serious/critical su lista, dettaglio e import` (e2e-local/30-prodotti-lista.spec.ts:790). Output: `[a11y lista] ["serious:color-contrast x8"]`, `[a11y import] ["serious:color-contrast x5"]`, con i nodi: `color-contrast button[aria-label="Ordina per categoria"] :: insufficient color contrast of 4.31 (foreground #657075, background #e9edee, 8.3pt)`, `color-contrast .product-import__intro :: 3.04 (#828b8f su #eef0f2)`, `color-contrast .product-import__upload-hint :: 3.2 (#828b8f su #f4f6f7)`.

**Verifica indipendente:** Riprodotto con axe-core (test V5). Sulla lista: 8 violazioni serious `color-contrast`, fra cui esattamente quelle dichiarate — `button[aria-label="Ordina per categoria"]`, `"Ordina per stagione"`, `"Ordina per stato"`, `.product-table__col--numeric`, `.product-table__col--source` tutte a **4.31 (#657075 su #e9edee)**, e `.product-list__label-copies` a **4.45**. Confermata anche la causa dichiarata, misurata a runtime: `header tabella: {"colore":"rgb(101,112,117)" (#657075 = --color-text-muted), "sfondo":"rgb(233,237,238)", "tokenHeaderFg":"#3f4c51"}` — il token prescritto dalla specifica esiste e vale #3f4c51 ma non viene applicato (`grep`: usato in un solo punto, `src/styles/_document-form.scss:1890`). Su /app/products/import esistono violazioni serious di contrasto, `.product-import__intro` inclusa.

---

### P3.8 · Il pannello «Colonne» è un role="dialog" che non si chiude con Esc e non intrappola il fuoco

**Area:** Prodotti: lista · **Tipo:** a11y · **Spec:** `e2e-local/30-prodotti-lista.spec.ts`

**Passi**

1. Vai su /app/products.
2. Premi «Colonne»: si apre un pannello con role="dialog" e aria-labelledby.
3. Premi Esc.

**Atteso:** Esc chiude l'overlay e il fuoco torna al pulsante che l'ha aperto (regole-architettura §Accessibilità: «Modali e overlay: focus trap obbligatorio + restore del focus alla chiusura»).

**Osservato:** Esc non fa nulla: il pannello resta aperto. L'unico modo di chiuderlo è cliccare fuori o ripremere «Colonne». `src/app/shared/components/table-column-picker/table-column-picker.component.ts` registra solo `'(document:click)': 'onDocumentClick($event)'`: nessun handler di Escape, nessun focus trap, nessun ripristino del fuoco. Il pannello è condiviso da undici schermate, quindi il difetto non è limitato ai Prodotti.

**Evidenza:** Test `a11y: nessuna violazione serious/critical su lista, dettaglio e import` (e2e-local/30-prodotti-lista.spec.ts:790). Output: `[a11y colonne] pannello ancora aperto dopo Esc: true`.

**Verifica indipendente:** Riprodotto (test V5). Il pannello espone `role=dialog` (verificato a runtime: `role=dialog`), e dopo `Escape` risulta ancora visibile (`ancora aperto dopo Esc: true`); il fuoco resta sul pulsante «Colonne» che l'ha aperto. Verificato anche il secondo capo dell'accusa: partendo da una checkbox interna, dopo 35 Tab il fuoco esce dal pannello (`fuoco uscito dal pannello dopo 35 Tab`) — nessun focus trap. Causa confermata in `src/app/shared/components/table-column-picker/table-column-picker.component.ts:18-27`: l'unico host listener è `'(document:click)': 'onDocumentClick($event)'`, nessun handler di Escape.

---

### P3.9 · Il filtro «Sotto soglia» non elenca articoli sotto soglia: restituisce solo gli Esauriti

**Area:** Magazzino: giacenze · **Tipo:** bug · **Spec:** `e2e-local/50-magazzino-giacenze.spec.ts`

**Passi**

1. /app/inventory → «Azzera filtri».
2. Filtro «Stato stock» → «Sotto soglia».
3. Guarda la colonna Stato delle righe restituite.

**Atteso:** L'elenco contiene le righe il cui Stato è «Sotto soglia», cioè gli articoli da riordinare che hanno ancora giacenza.

**Osservato:** Tutte e 7 le righe restituite hanno Stato «Esaurito»; nessuna è «Sotto soglia». L'API applica `available <= minThreshold`, condizione che ingloba anche `available <= 0` (gli esauriti), e il frontend non rifiltra per il solo stato low (rifiltra solo ok/empty). Il filtro non può quindi rispondere alla domanda per cui esiste: quali articoli stanno per finire ma ci sono ancora.

**Evidenza:** docs/test-results/screenshots-local/giacenze-filtro-sotto-soglia-mostra-esauriti.png · output test: «SOTTO SOGLIA — stati mostrati: ["Esaurito","Esaurito","Esaurito","Esaurito","Esaurito","Esaurito","Esaurito"]»

**Verifica indipendente:** Riprodotto 3 volte: con «Sotto soglia» tornano 14-16 righe e la colonna Stato riporta «Esaurito» su TUTTE. La causa è nel codice ed è verificata: l'API applica `available: { lte: minThreshold }` (api/src/inventory/inventory.service.ts:122-124), predicato senza limite inferiore che ingloba `available <= 0`; il frontend rifiltra client-side solo `ok` ed `empty` (inventory-levels.component.ts:345-353) e non `low`. L'asimmetria dentro lo stesso componente è il difetto: due opzioni su tre sono rese esclusive, la terza no, e il risultato è un filtro etichettato «Sotto soglia» che restituisce righe con badge «Esaurito».

---

### P3.10 · In Giacenze l'ordine alfabetico riparte da capo a ogni pagina

**Area:** Magazzino: giacenze · **Tipo:** ux · **Spec:** `e2e-local/50-magazzino-giacenze.spec.ts`

**Passi**

1. /app/inventory → «Azzera filtri».
2. Imposta «Per pagina» = 10 (servono più di 10 giacenze).
3. Leggi l'ultima riga di pagina 1, vai a pagina 2 e leggi la prima.

**Atteso:** L'elenco è ordinato una volta sola: la pagina 2 riprende da dove finisce la pagina 1.

**Osservato:** Pagina 1 finisce con «test», pagina 2 comincia con «E2E-VEN-Maglia 92346121» / «eeee»: l'alfabeto riparte. Il server ordina per updatedAt desc e pagina su quell'ordine, mentre il componente riordina per titolo solo le righe della pagina corrente. Cercare un articolo per posizione alfabetica è quindi impossibile, e la lista sembra ordinata pur non essendolo.

**Evidenza:** docs/test-results/screenshots-local/giacenze-ordinamento-riparte-da-capo-in-pagina-2.png · output test: PAG.1 [...,"E2E-VEN-Maglia 92508839","test"] / PAG.2 ["E2E-VEN-Maglia 92346121","eeee","fdgtrrtrt",...]

**Verifica indipendente:** Riprodotto 3 volte con page size 10. Ultima riga di pagina 1: «test»; prima riga di pagina 2: «E2E-MOV-Articolo-3503772» — l'alfabeto ricomincia. Le due pagine contengono anche voci della stessa famiglia intercalate (E2E-MOV-Articolo-2675546…4368905 in pagina 1, 3503772 e 3847511 in pagina 2), quindi non è un caso di collation. Causa verificata nel codice: il server ordina `orderBy: { updatedAt: 'desc' }` e pagina su quell'ordine (api/src/inventory/inventory.service.ts:134), mentre il componente applica `.sort((a,b) => a.title.localeCompare(b.title) || ...)` alle sole righe della pagina corrente (inventory-levels.component.ts:354-356).

---

### P3.11 · I filtri di Giacenze non vivono nell'URL: ricaricando la pagina si perdono (doc §20.10)

**Area:** Magazzino: giacenze · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/50-magazzino-giacenze.spec.ts`

**Passi**

1. /app/inventory, scrivi «goku» nella ricerca: restano 2 righe.
2. Guarda la barra degli indirizzi.
3. Ricarica la pagina (F5).

**Atteso:** Doc funzionale §20.10: «I filtri di lista vivono nell'URL: ricaricare la pagina mantiene la vista». È anche il comportamento delle altre liste dell'app (Prodotti, Clienti, Documenti leggono queryParamMap).

**Osservato:** L'URL resta http://localhost:4200/app/inventory senza query param; dopo il reload il campo ricerca è vuoto e tornano tutte le 20 righe. Vale anche per Location, Stato stock, pagina e page size (inventory-levels.component.ts tiene tutto in signal e non sincronizza la rotta). Una vista filtrata non è quindi condivisibile via link e si perde a ogni ricarica.

**Evidenza:** docs/test-results/screenshots-local/giacenze-filtri-persi-al-reload.png · output test: «URL CON RICERCA: http://localhost:4200/app/inventory» e «RICERCA DOPO RELOAD: "" righe 20»

**Verifica indipendente:** Riprodotto 3 volte. Dopo aver digitato una ricerca l'URL resta `http://localhost:4200/app/inventory` senza alcun query param; lo stesso dopo aver scelto «Esaurito» in Stato stock. Al reload il campo ricerca è vuoto e tornano tutte le 20 righe di pagina 1. Il controprova sta nello stesso test: sulla lista Prodotti la stessa sequenza produce `http://localhost:4200/app/products?search=mag`, quindi il pattern esiste ed è applicato altrove. Nel componente tutti i filtri sono `signal()` senza alcuna sincronizzazione con il Router (inventory-levels.component.ts:165-173).

---

### P3.12 · Il messaggio di SKU/EAN duplicato non nomina il record in conflitto, mentre quello del codice articolo lo fa

**Area:** Prodotti: creazione · **Tipo:** ux · **Spec:** `.claude/rules/regole-gestionale.md §«Regole per un blocco ben fatto»`

**Passi**

1. Nella maschera nuovo prodotto digitare uno SKU già esistente e attendere la verifica live: leggere il messaggio sotto il campo.
2. Fare lo stesso con un EAN già esistente.
3. Nella stessa maschera, digitare un codice articolo già esistente e leggere il messaggio sotto quel campo.

**Atteso:** regole-gestionale.md §«Regole per un blocco ben fatto»: «riferimento al record in conflitto quando disponibile (es. "SKU 00036 già in uso — prodotto: Maglietta test cotone")».

**Osservato:** SKU: «SKU già in uso da un altro prodotto.» — nessun nome, nessun codice, nessun link. EAN: «EAN già in uso da un'altra variante.» — idem. Codice articolo, due campi più su nella stessa schermata: «Codice articolo già utilizzato da E2E-PFRM-RAPIDO-862475.». Il dato per farlo esiste già lato API per il codice articolo (la risposta di disponibilità porta `takenBy`), mentre l'endpoint di disponibilità SKU/barcode restituisce solo l'elenco dei valori occupati: la correzione richiede di arricchire quella risposta.

**Evidenza:** Output test T8: `[T8] codice "89589" · messaggio: "Codice articolo già utilizzato da E2E-PFRM-RAPIDO-862475."` a fronte dello screenshot evid-sku-duplicato-cta-abilitata.png che mostra il solo «SKU già in uso da un altro prodotto.».

**Verifica indipendente:** Riprodotto (V5) nella STESSA maschera e nello stesso momento, sui tre campi in sequenza. Occupante creato con codice articolo «89599». Nella maschera nuova: `[V5] messaggio CODICE ARTICOLO: "Codice articolo già utilizzato da E2E-VERI-454987-OCC5."` · `[V5] messaggio SKU: "SKU già in uso da un altro prodotto."` · `[V5] messaggio EAN: "EAN già in uso da un'altra variante."`. Il confronto interno alla stessa schermata regge: uno dei tre blocchi nomina il record, gli altri due no. regole-gestionale §«Regole per un blocco ben fatto» chiede il riferimento al record «quando disponibile».

---

### P3.13 · «Registro commercialista» (/app/reports/accountant-register) è ancora documentato ma non esiste: l'indirizzo cade in Dashboard senza dire niente

**Area:** Dashboard, Report · **Tipo:** divergenza-documentazione · **Spec:** `docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md:115, 504-521, 637`

**Passi**

1. Aprire http://localhost:4200/app/reports/accountant-register (rotta indicata in DOCUMENTO-FUNZIONALE §15.3, tabella rotte riga 115 e mappa permessi §21)
2. Osservare dove si atterra
3. Aprire /app/reports e cercare i due link rapidi documentati in §15.1

**Atteso:** O la pagina esiste, o i documenti non la promettono più. In ogni caso un indirizzo inesistente dentro /app dovrebbe portare a uno stato «pagina non trovata», non a una schermata qualsiasi.

**Osservato:** Redirect silenzioso su /app/dashboard (h1 «Dashboard»), identico a quello di una rotta inventata (/app/reports/questa-rotta-non-esiste-e2e-dash): il catch-all `**` inghiotte tutto. La pagina è stata rimossa il 16/08/2026 (docs/DA-FARE-FAMIGLIA-FATTURA.md §E — decisione del proprietario), ma DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md la descrive ancora per intero (§15.3: tab Documenti/Corrispettivi, KPI «Da emettere», «Inviate al commercialista», link «Apri registro documenti filtrato» e «DDT da fatturare») e §15.1 promette il link «Registro commercialista unificato →», che in pagina non c'è: resta il solo «Apri registro corrispettivi commercialista →». La ricerca globale su «commercialista» non restituisce nulla, quindi la rimozione lato app è coerente — è la documentazione a essere indietro.

**Evidenza:** Test T7 in e2e-local/20-dashboard-report.spec.ts (verde: registra il comportamento). Output:
[T7] /app/reports/accountant-register → http://localhost:4200/app/dashboard (h1="Dashboard")
[T7] /app/reports/questa-rotta-non-esiste-e2e-dash → http://localhost:4200/app/dashboard (h1="Dashboard")
[T7] link rapidi in Report: ["Apri registro corrispettivi commercialista →"]
Screenshot: docs/test-results/screenshots-local/T7-accountant-register-redirect.png

**Verifica indipendente:** Riprodotto (V4): /app/reports/accountant-register → http://localhost:4200/app/dashboard (h1="Dashboard"), identico a una rotta inventata da me (/app/reports/questa-rotta-non-esiste-verifica-xyz → stessa destinazione). In pagina Report l'unico link è «Apri registro corrispettivi commercialista →». Verificata anche la parte documentale con una ricerca mia: 'accountant-register' non compare in NESSUN file sotto src/ (né rotte, né componenti), mentre DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md lo cita ancora a riga 115 (tabella rotte), 519 (§15.3 intera sezione), 637 (mappa permessi §21) e promette a riga 510 il link «Registro commercialista unificato →» che non esiste. Anche PIANO-TEST-VESTIFLOW.md:2780 lo cita.

---

### P3.14 · Separatore delle migliaia incoerente: nella stessa fila di KPI convivono «5625,00 €» e «13.410,00 €»

**Area:** Dashboard, Report · **Tipo:** ux · **Spec:** `src/app/core/utils/money.util.ts:97-105`

**Passi**

1. Aprire /app/dashboard e leggere i KPI monetari del pannello «Performance commerciale»
2. Confrontare «Margine stock» (4 cifre) con «Valore magazzino» (5 cifre)
3. Ripetere su /app/sales/corrispettivi?period=year, riquadro «Riepilogo periodo»
4. Ripetere sulla pagina di stampa /app/sales/corrispettivi/print?period=year

**Atteso:** Importi formattati allo stesso modo in tutta la colonna/fila: 5.625,00 € e 13.410,00 €. regole-gestionale, colonne numeriche: «formattati sempre in modo coerente».

**Osservato:** formatMoney usa Intl.NumberFormat('it-IT') con il raggruppamento predefinito, che per l'italiano è «min2»: sotto le 5 cifre il punto delle migliaia non compare. Risultato misurato nella stessa schermata: Margine stock «5625,00 €» / Previsione mese «1764,83 €» / Fatturato «1708,00 €» accanto a Valore magazzino «13.410,00 €». Stessa cosa nel riepilogo corrispettivi («Totale vendite 1952,00 €», «Imponibile 1600,00 €») e sul foglio di stampa consegnato al commercialista («300,00 €», «1300,00 €», «1586,00 €»). I numeri sono tabular-nums e allineati, ma la lettura a colpo d'occhio di una colonna mista è la cosa che il raggruppamento dovrebbe risolvere.

**Evidenza:** Test T1 e T13 in e2e-local/20-dashboard-report.spec.ts (verdi, registrano la misura). Output:
[T1] importi a 4 cifre senza punto: [["Fatturato","1708,00 €"],["Previsione mese","1764,83 €"],["Margine stock","5625,00 €"]] · a 5 cifre col punto: [["Valore magazzino","13.410,00 €"]]
[T10] foglio: … Imponibile 1300,00 € IVA 286,00 € Totale 1586,00 €
Verifica indipendente: node -e "new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(1952)" → «1952,00 €»; format(14100) → «14.100,00 €»
Screenshot: docs/test-results/screenshots-local/T1-separatore-migliaia.png, T13-kpi-analytics.png

**Verifica indipendente:** Riprodotto (V5) con estrazione mia dai .stat-card__label/.stat-card__value-main: nella stessa schermata /app/dashboard convivono Fatturato «4148,00 €», Previsione mese «4286,37 €», Margine stock «6735,00 €» accanto a Valore magazzino «14.540,00 €». Gli importi differiscono da quelli dell'agente originale (il DB condiviso si è mosso) ma il fenomeno è identico e stabile. Verificata la causa in modo indipendente: node -e con Intl.NumberFormat('it-IT') dà 1952 → «1952,00 €» e 14100 → «14.140,00/14.100,00 €» col punto, quindi è il raggruppamento predefinito e formatMoney (money.util.ts:97-105) non passa useGrouping.

---

### P3.15 · Il periodo scelto sulla Dashboard non entra nell'URL e si perde a ogni ricarica (sul Report invece è persistito)

**Area:** Dashboard, Report · **Tipo:** ux · **Spec:** `src/app/domain/analytics/components/business-analytics-panel/business-analytics-panel.component.ts:314-338`

**Passi**

1. Aprire /app/dashboard
2. Nel pannello «Performance commerciale» scegliere un periodo diverso dal default, es. «Anno» o «Personalizzato»
3. Guardare la barra degli indirizzi
4. Ricaricare la pagina (F5)

**Atteso:** Coerenza con le altre schermate della stessa area: /app/reports e /app/sales/corrispettivi scrivono period/from/to/corrChannel in query param e li ripristinano al reload (verificato in T5 e T9). regole-gestionale, «Persistenza stato UI»: pagina, ordinamento, ricerca e filtri in query param, «migliora UX e condivisibilità della pagina».

**Osservato:** L'URL resta http://localhost:4200/app/dashboard qualunque periodo si scelga; dopo F5 il selettore torna a «30 giorni». La vista non è condivisibile né ripristinabile, e non c'è modo di aprire un segnalibro sulla dashboard annuale.

**Evidenza:** Test T2 in e2e-local/20-dashboard-report.spec.ts (verde, registra la misura). Output:
[T2] Personalizzato → /analytics/business-summary?period=custom&from=2026-08-17&to=2026-08-17&locationId=…
[T2] URL dopo la scelta: http://localhost:4200/app/dashboard · periodo dopo reload: "30 giorni"
Confronto T5: [T5] dopo 7 giorni: http://localhost:4200/app/reports?period=7d … [T5] dopo reload → periodo="Ultimi 7 giorni" canale="Vendita online"

**Verifica indipendente:** Riprodotto (V6). Sulla dashboard il segmented offre ["7 giorni","30 giorni","Mese","Mese scorso","Anno","Personalizzato"], attivo iniziale «30 giorni»; scelto «Anno», l'URL resta http://localhost:4200/app/dashboard (nessun query param); dopo reload l'URL è invariato e il periodo attivo torna a «30 giorni». Controprova mia sul comportamento opposto: /app/reports?period=year mantiene il parametro dopo il reload. Coerente col codice: business-analytics-panel gestisce il periodo in signal interni (uiPeriod/internalDateFrom/To) senza toccare il router quando layout='dashboard'.

---

### P3.16 · La Dashboard chiama /dashboard/summary due volte a ogni apertura (una prima che la location attiva sia nota)

**Area:** Dashboard, Report · **Tipo:** bug · **Spec:** `src/app/features/dashboard/dashboard.component.ts:127-135`

**Passi**

1. Aprire /app/dashboard con il pannello di rete aperto (o eseguire il test T1, che traccia le richieste)
2. Contare le chiamate a /api/v1/dashboard/summary

**Atteso:** Una sola chiamata, emessa quando il contesto location è risolto.

**Osservato:** Due: GET /dashboard/summary (senza locationId) e subito dopo GET /dashboard/summary?locationId=214f4bda-… . La prima risposta viene scartata. Il payload è un'aggregazione con $transaction su inventory_levels, product e supplier_order: su un database condiviso è lavoro doppio a ogni apertura della schermata più visitata. Stesso schema, più contenuto, sulla pagina Report: /analytics/business-summary?period=30d viene emessa tre volte (una senza locationId più due identiche con locationId — pannello KPI e pannello grafici che interrogano lo stesso endpoint con gli stessi parametri).

**Evidenza:** Test T1 in e2e-local/20-dashboard-report.spec.ts (verde, registra la misura). Output:
[T1] chiamate /dashboard/summary: 2 → GET /dashboard/summary ; GET /dashboard/summary?locationId=214f4bda-e5a2-4e43-8f67-ef57b4b0610d
[T5] chiamate analytics: GET /analytics/business-summary?period=30d ; GET …?period=30d&locationId=214f… ; GET …?period=30d&locationId=214f… (identica)

**Verifica indipendente:** Riprodotto 2 volte (V5/V7, tracciamento richieste mio): esattamente 2 chiamate a ogni apertura di /app/dashboard — GET /dashboard/summary (senza locationId) e GET /dashboard/summary?locationId=214f4bda-e5a2-4e43-8f67-ef57b4b0610d; la prima è emessa prima che LocationContextService abbia risolto la location attiva e la sua risposta viene scartata. Verificato anche il secondo caso in un test dedicato (V7b): su /app/reports partono 3 chiamate a /analytics/business-summary — ?period=30d, poi DUE volte ?period=30d&locationId=214f4bda-… byte per byte identiche (URL distinti 2, duplicati esatti 1), perché pannello KPI e pannello grafici interrogano lo stesso endpoint con gli stessi parametri.

---

### P3.17 · Il riepilogo di conferma di un movimento non dice quantità né impatto atteso, nemmeno quando la giacenza andrà sotto zero

**Area:** Movimenti · **Tipo:** ux · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. /app/inventory/movements/new?type=unload su un articolo con disponibile 3.
2. Aggiungi l'articolo e imposta quantità 7: in riga compare l'avviso «Supera il disponibile (3)» (corretto, non bloccante).
3. Premi «Salva» e leggi il dialogo di conferma.

**Atteso:** regole-gestionale §Azioni sensibili chiede un riepilogo finale prima del submit, e per i movimenti (esplicito sui trasferimenti) «quantità e impatto finale atteso». Con giacenze negative in arrivo il riepilogo dovrebbe almeno nominare la quantità e il risultato (3 − 7 = −4).

**Osservato:** Il dialogo dice solo «Registrare 1 articolo come scarico su Test SG?» — conta gli articoli, non le quantità, e non riporta né il disponibile né la giacenza risultante. L'avviso «Supera il disponibile» resta nella riga sottostante e non viene ripetuto nella conferma. Confermando, la giacenza va a −4 (onHand e available) senza ulteriore segnalazione. Le impostazioni del tenant in quel momento erano allowNegativeInventory=false, warnNegativeInventory=true, blockNegativeInventory=false: il mancato blocco è coerente col flag «Blocca scarichi oltre disponibile» spento, ma la conferma di un'azione sensibile resta muta proprio sul dato che serve per decidere.

**Evidenza:** docs/test-results/screenshots-local/mov-scarico-oltre-disponibile.png. Output test: «[oltre] disponibile in riga: «3» (API 3)» · «[oltre] avviso riga: Supera il disponibile (3)» · «[oltre] conferma → titolo «Conferma scarico» riepilogo «Registrare 1 articolo come scarico su Test SG?»» · «[oltre] onHand 3 → -4 (available -4)».

**Verifica indipendente:** Riprodotto con disponibile 8 e quantità 12. In riga compare correttamente l'avviso non bloccante «Supera il disponibile (8)». Il dialogo di conferma, letto per intero, è: «Conferma scarico · Registrare 1 articolo come scarico su Test SG? · Annulla · Registra» — nessuna occorrenza della quantità 12, nessun riferimento al disponibile né alla giacenza risultante, e l'avviso di riga non viene ripetuto. Confermando, onHand e available vanno a -4. Confermato nel codice: movement-form.component.ts:538-547, confirmMessage() usa this.lines().length (conta gli articoli, non i pezzi). Impostazioni tenant al momento della prova: allowNegativeInventory=false, warnNegativeInventory=true, blockNegativeInventory=false — quindi il mancato blocco è coerente con la configurazione, il difetto è solo la mutezza del riepilogo.

---

### P3.18 · Il dialogo di conferma del movimento viene annunciato agli screen reader col titolo del dialogo di logout (id DOM duplicato)

**Area:** Movimenti · **Tipo:** a11y · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. Apri una qualsiasi schermata dentro la shell (es. /app/inventory/movements/new?type=load).
2. Compila e premi «Salva»: si apre il dialogo «Conferma carico».
3. Con il dialogo aperto, valuta il nome accessibile: document.querySelectorAll('#confirm-dialog-title').length e il testo dell'elemento puntato da aria-labelledby.

**Atteso:** Il dialogo aperto è annunciato «Conferma carico». Un id nel DOM è unico.

**Osservato:** In pagina ci sono 2 elementi con id «confirm-dialog-title»: la shell tiene sempre montato il proprio app-confirm-dialog (logout, «Uscire dall'applicazione?») e il componente condiviso src/app/shared/components/confirm-dialog/confirm-dialog.component.html ha l'id scritto a mano nel template. aria-labelledby="confirm-dialog-title" del dialogo di conferma movimento risolve quindi sul titolo del dialogo di logout: il nome accessibile letto è «Uscire dall'applicazione?» mentre a schermo c'è «Conferma carico». Il difetto è nel componente condiviso, quindi vale per ogni conferma di azione sensibile dell'app, non solo per i movimenti.

**Evidenza:** docs/test-results/screenshots-local/mov-conferma-nome-accessibile-sbagliato.png. Output test: «[a11y] titolo visibile «Conferma carico» · nome accessibile «Uscire dall'applicazione?» · elementi con id confirm-dialog-title: 2». Riscontrato anche in fase di scrittura del test: page.locator('dialog.confirm-dialog') va in strict mode violation con due dialoghi in pagina.

**Verifica indipendente:** Riprodotto due volte, su esecuzioni distinte. Con il dialogo «Conferma carico» aperto: document.querySelectorAll('#confirm-dialog-title').length = 2, dialog.confirm-dialog in pagina = 2, titoli presenti = ["Uscire dall'applicazione?", "Conferma carico"]. Il dialogo aperto ha aria-labelledby="confirm-dialog-title" che risolve su «Uscire dall'applicazione?», mentre a schermo si legge «Conferma carico». Causa verificata nel codice: l'id è scritto a mano nel template condiviso src/app/shared/components/confirm-dialog/confirm-dialog.component.html:7, e la shell tiene sempre montata la propria istanza (shell-layout.component.html:51). Il difetto è quindi del componente condiviso e vale per ogni conferma di azione sensibile dell'app.

---

### P3.19 · Con una sola location il pulsante «Trasferimento» porta a un form che non può mai essere salvato

**Area:** Movimenti · **Tipo:** ux · **Spec:** `e2e-local/60-movimenti-inventario.spec.ts`

**Passi**

1. /app/inventory/movements su un tenant con una sola location attiva (qui: «Test SG»).
2. Premi «Trasferimento» nella testata.
3. Apri la tendina «Location di destinazione».
4. Aggiungi un articolo e premi «Salva».

**Atteso:** O l'azione non viene offerta quando manca una seconda location, oppure il form spiega subito che serve una seconda sede (empty state / messaggio in testata), come fa la maschera per le righe quando manca un campo obbligatorio di testata.

**Osservato:** Il pulsante è sempre presente. La tendina «Location di destinazione» contiene solo il segnaposto «Seleziona…», nessuna opzione (transferTargetLocations() esclude la location di origine, che è l'unica). L'operatore compila tutto e scopre il vicolo cieco solo al salvataggio, con il messaggio «Seleziona la location di destinazione.» — che chiede di scegliere una voce che non esiste.

**Evidenza:** docs/test-results/screenshots-local/mov-trasferimento-mono-location.png. Output test: «[trasferimento] opzioni destinazione: ["Seleziona…"]» · «[trasferimento] errore atteso: Seleziona la location di destinazione.»

**Verifica indipendente:** Riprodotto. Il tenant ha 1 sola location attiva (GET /inventory/locations → «Test SG»). Il pulsante «Trasferimento» è comunque presente in testata; la tendina «Location di destinazione» contiene esclusivamente il segnaposto: opzioni lette a runtime = ["Seleziona…"]. Aggiunto un articolo e premuto Salva, il dialogo di conferma NON si apre e compare il messaggio «Seleziona la location di destinazione.» — che chiede di scegliere una voce inesistente. Nota di metodo: al primo tentativo il mio selettore per il messaggio d'errore era sbagliato (l'errore vive in .doc-form__submit-error, non in app-inline-banner) e il test lo dava per assente; corretto il selettore, il messaggio è comparso esattamente come descritto. Confermato nel codice: movement-form.component.ts:193-197 filtra via la location di origine, e :647 produce quel messaggio.

---

### P3.20 · Il pannello «Magazzino e documenti» annuncia una «policy di aggiornamento prezzo fornitore» che non esiste in nessuna impostazione

**Area:** Clienti, impostazioni · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/95-clienti-impostazioni.spec.ts`

**Passi**

1. Accedere come titolare e aprire /app/settings.
2. Leggere il sottotitolo del pannello «Magazzino e documenti»: «Lotti, seriali, IVA predefinita e aggiornamento prezzo fornitore in arrivo merce.»
3. Leggere il primo hint dentro il pannello: «Lotti, seriali e policy di aggiornamento prezzo fornitore si applicano a magazzino e arrivo merce.»
4. Scorrere tutti i controlli del form: Tracciabilità (lotti, seriali), Prezzi (prezzi di vendita netti/ivati), Default articoli (U.M., Codice IVA), Listini aggiuntivi ×3, Giacenze negative ×2.

**Atteso:** I testi descrivono le impostazioni effettivamente presenti nel pannello. Chi cerca la policy prezzo fornitore la trova, oppure il testo non la nomina.

**Osservato:** Nessun controllo riguarda il prezzo/costo fornitore. I formControlName presenti sono esattamente: lotsEnabled, serialsEnabled, salesPricesIncludeVat (prezzi di VENDITA), defaultUnitOfMeasure, defaultVatCodeId, listino1/2/3 Name+Active, warnNegativeInventory, blockNegativeInventory.

Confermato a livello di dato: api/prisma/schema.prisma → model TenantFeatureSettings non ha alcun campo di policy prezzo fornitore. L'aggiornamento del costo di riferimento è una SPUNTA DEL SINGOLO DOCUMENTO di Arrivo merce (api/src/documents/document-supplier-price.util.ts → applySupplierPriceUpdates(..., updateArticleReferenceCost)). Il testo descrive quindi un meccanismo tolto (o mai arrivato) al livello tenant, e manda a cercare in Impostazioni una scelta che si fa sul documento.

**Evidenza:** Output test («impostazioni: i testi promettono una policy prezzo fornitore che non esiste»):
[HINT hub] Lotti, seriali, IVA predefinita e aggiornamento prezzo fornitore in arrivo merce.
[HINT panel] Lotti, seriali e policy di aggiornamento prezzo fornitore si applicano a magazzino e arrivo merce.
[CONTROLS] ["lotsEnabled","serialsEnabled","salesPricesIncludeVat","defaultUnitOfMeasure","defaultVatCodeId","","tenant-ops-listino-1-name","","tenant-ops-listino-2-name","","tenant-ops-listino-3-name","warnNegativeInventory","blockNegativeInventory"]
[ESITO] promette=true controllo=false

Screenshot: docs/test-results/screenshots-local/cli-settings-policy-prezzo-fornitore-assente.png
Sorgenti: src/app/features/settings/settings.component.html:67 e src/app/features/settings/components/tenant-operational-settings-panel/tenant-operational-settings-panel.component.html:12

**Verifica indipendente:** Riprodotto a runtime (test D2), due esecuzioni su due. Testi letti dal DOM: hint hub = «Lotti, seriali, IVA predefinita e aggiornamento prezzo fornitore in arrivo merce.» (settings.component.html:67); hint pannello = «Lotti, seriali e policy di aggiornamento prezzo fornitore si applicano a magazzino e arrivo merce.» (tenant-operational-settings-panel.component.html:12). Controlli effettivamente renderizzati nel pannello: lotsEnabled, serialsEnabled, salesPricesIncludeVat, defaultUnitOfMeasure, defaultVatCodeId, i tre listini (nome+attivo), warnNegativeInventory, blockNegativeInventory. Legende: Tracciabilità · Prezzi · Default articoli · Listini aggiuntivi · Giacenze negative. Nessun controllo tocca il prezzo/costo fornitore, e l'unica occorrenza di «fornitore» nel pannello è dentro i due hint stessi. Verificato anche a livello di dato: TenantFeatureSettings in api/prisma/schema.prisma non ha alcun campo di policy prezzo fornitore, e l'aggiornamento del costo di riferimento è una spunta del singolo documento di Arrivo merce (api/src/documents/document-supplier-price.util.ts).

---

### P3.21 · La shell chiede le sedi a ogni navigazione anche a chi non ha la sezione Magazzino: 403 ripetuti su GET /inventory/locations

**Area:** Clienti, impostazioni · **Tipo:** bug · **Spec:** `e2e-local/95-clienti-impostazioni.spec.ts`

**Passi**

1. Accedere con un account commesso privo della sezione Magazzino (usato: E2E_CLERK_CATALOG_IMPORT_EMAIL, ruolo clerk).
2. Aprire la console di rete e navigare fra Dashboard, Prodotti, Impostazioni, Codici IVA, Pagamenti.
3. Osservare le risposte con status ≥ 400.

**Atteso:** Il frontend conosce già i permessi dell'utente (li usa per costruire la sidebar e per i guard di rotta): non deve chiamare un endpoint che sa essere vietato. Nessuna 4xx in una navigazione normale.

**Osservato:** GET /api/v1/inventory/locations risponde 403 a OGNI navigazione — 8-9 volte in una sessione di pochi minuti. La chiamata parte da src/app/layout/shell-layout.component.ts (OperationalLocationsService, selettore sede in topbar) senza alcun gate sui permessi, mentre l'API la protegge con @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS) (api/src/inventory/inventory.controller.ts:99-100).

Nello stesso giro compaiono anche 3 × 403 GET /api/v1/tenant/company sulla pagina Impostazioni: quella è però gestita esplicitamente (settings.component.ts mappa AppErrorKind.Forbidden su uno stato 'forbidden' e nasconde il pannello), quindi è rumore accettato per scelta. Quella sulle location non ha equivalente.

Effetto: nessun crash visibile, ma log di errore in console su ogni pagina, traffico inutile e rumore che nasconde i 403 veri in fase di diagnosi.

**Evidenza:** Output test («permessi commesso: sidebar, route riservate e comandi di scrittura»):
[API 4xx/5xx] [
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/tenant/company",
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/tenant/company",
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/tenant/company",
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/inventory/locations",
"403 GET /api/v1/inventory/locations"
]
Isolato inoltre per pagina: [DOPO LOGIN] 403 /inventory/locations · [SU PRODOTTI] 403 /inventory/locations · [SU IMPOSTAZIONI] 403 /inventory/locations + 403 /tenant/company.

Screenshot: docs/test-results/screenshots-local/cli-commesso-403-inventory-locations.png

**Verifica indipendente:** Riprodotto con contesto browser dedicato (test D3), due esecuzioni su due. Login come E2E_CLERK_CATALOG_IMPORT: la sidebar non contiene Magazzino (Dashboard · Prodotti · Vendite · Vendite online · Corrispettivi · Canali online · Ordini Shopify · Report · Impostazioni), quindi l'utente giusto. Contati esattamente 5 × «403 GET /api/v1/inventory/locations» — uno al login e uno per ciascuna delle 4 navigazioni successive (/app/products, /app/settings, /app/dashboard, /app/settings/vat-codes) — su 6 fallimenti API totali; il sesto è il 403 su /api/v1/tenant/company sulla pagina Impostazioni, che come già osservato è gestito esplicitamente. Ogni 403 produce anche un errore in console («Failed to load resource: 403 Forbidden»). Il frontend conosce già i permessi (li usa per la sidebar), quindi la chiamata è evitabile: parte da ShellLayoutComponent → OperationalLocationsService senza gate sui permessi, mentre l'API la protegge con @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS).

---

### P3.22 · Vendita al banco oltre la disponibile: la documentazione dice «rifiutata», la cassa la accetta e manda la giacenza in negativo

**Area:** Vendita al banco · **Tipo:** divergenza-documentazione · **Spec:** `C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\e2e-local\90-vendite.spec.ts`

**Passi**

1. Login titolare, /app/sales/register, Location «Test SG».
2. Scansiona E2E-VEN-SKU-92254665 (disponibile 7) e porta la quantità di riga a 8.
3. Osserva l'avviso di riga e la banda sopra il carrello.
4. Premi «Concludi vendita» e conferma.

**Atteso:** §11.1: «Il controllo quantità è sulla Disponibile (giacenza − impegnata): superarla blocca la vendita». §20.7: «Vendita rifiutata per stock insufficiente se la disponibile della sede è inferiore alla quantità richiesta in cassa». I due documenti sono citati come oracoli dei test end-to-end.

**Osservato:** Nessun blocco. Il pulsante «Concludi vendita» resta abilitato, l'avviso è esplicito nell'ammettere il contrario — «Una o più righe superano la disponibilità attuale. Puoi concludere la vendita: la giacenza potrà andare in negativo» — e la vendita va a buon fine portando la giacenza a −1. La scelta è deliberata e commentata nel codice (`store-sales.service.ts`: «Nessuna guardia: la vendita si registra anche oltre la disponibile (§3)»; `store-sale-register.component.ts`: «Righe che superano la Disponibile: avviso non bloccante (§16 post-audit)»), quindi non è una regressione ma una divergenza fra codice e documento funzionale: chi usa §20.7 come oracolo scrive test sbagliati.

**Evidenza:** Test `cassa: quantità oltre la disponibile — §20.7 dice «rifiutata», la cassa la accetta`. Output: «LIVELLO PRIMA OVERSELL {onHand:7,available:7,committed:0} vendo 8» · «BANNER Una o più righe superano la disponibilità attuale. Puoi concludere la vendita: la giacenza potrà andare in negativo.» · «CONCLUDI DISABILITATO? false» · «LIVELLO DOPO OVERSELL {onHand:-1,available:-1,committed:0}». Giacenza ripristinata subito dopo con una rettifica tracciata. Screenshot: C:\Users\Domen\OneDrive\Desktop\Progetti\Progetto-vestiflow\vestiflow\docs\test-results\screenshots-local\ven-oltre-disponibile-non-bloccato.png

**Verifica indipendente:** Divergenza reale, riprodotta con script indipendente (test «VERIFICA D3») su articolo mio con disponibile 0. UI: banner testuale «Una o più righe superano la disponibilità attuale. Puoi concludere la vendita: la giacenza potrà andare in negativo.» e «Concludi vendita» NON disabilitato (log «UI «Concludi vendita» DISABILITATO? false»). API: `POST /store-sales` con 1 pezzo su disponibile 0 → HTTP 201 (VN-0018), livello {onHand:−1, available:−1}. Le due citazioni del documento funzionale sono verificate alla lettera: §11.1 riga 415 «Il controllo quantità è sulla Disponibile (giacenza − impegnata): superarla blocca la vendita» e §20.7 riga 594 «Vendita rifiutata per stock insufficiente…».

---

### P3.23 · P. IVA fornitore senza alcuna validazione: «123» viene accettata e salvata

**Area:** Fornitori · **Tipo:** bug · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. /app/suppliers/<id>/edit (oppure /app/suppliers/new).
2. Scrivere «123» nel campo P. IVA e uscire dal campo.
3. «Salva fornitore».
4. Rileggere il fornitore: GET /api/v1/suppliers/<id>.

**Atteso:** Almeno una segnalazione di formato (P. IVA italiana = 11 cifre), come già accade per Email e PEC che marcano `aria-invalid="true"` e mostrano il messaggio inline.

**Osservato:** Nessun `aria-invalid`, nessun messaggio, salvataggio accettato: il server restituisce `vatNumber: "123"`. Non c'è validazione né lato form (`src/app/domain/suppliers/utils/supplier-form.util.ts`: `vatNumber: fb.control('')`, nessun validatore, mentre email e pec hanno `Validators.email`) né lato DTO API (`api/src/supplier-orders/dto/create-supplier.dto.ts`: solo `@IsOptional() @IsString()`). Il dato finisce nei documenti d'acquisto e nell'anagrafica usata per la fatturazione elettronica.

**Evidenza:** Log test: «[fornitori] P.IVA '123' aria-invalid=null» seguito da «[fornitori] P.IVA salvata dal server: "123"». Screenshot: docs/test-results/screenshots-local/for-piva-non-validata.png. (Il test ripristina subito la P. IVA valida 12345678903.)

**Verifica indipendente:** Riprodotto due volte (test D5) con una contro-prova nella stessa maschera per escludere l'artefatto di selettore: la Email marca il difetto («[D5] contro-prova email 'non-una-email' aria-invalid=true»), la P. IVA no («[D5] P.IVA '123' aria-invalid=null · errori inline: []»). Dopo «Salva fornitore» il server rilegge «[D5] P.IVA salvata dal server: "123"». Il meccanismo di segnalazione funziona su quella maschera: manca proprio la regola. Confermato in sorgente: supplier-form.util.ts vatNumber senza validatori, create-supplier.dto.ts solo @IsOptional @IsString @MaxLength(20).

---

### P3.24 · Arrivo merce creato da ordine: la tabella nasce con una riga vuota in testa, prima delle righe dell'ordine

**Area:** Fornitori · **Tipo:** ux · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. Dettaglio di un ordine fornitore Confermato → «Crea arrivo merce» → confermare il dialogo.
2. Contare le righe della tabella «Righe documento».

**Atteso:** Solo le righe residue dell'ordine (una, nel caso di prova).

**Osservato:** Due righe: la riga 1 è vuota (nessun articolo, Q.tà preimpostata a 1, totale 0,00 €) e la riga 2 è quella dell'ordine. Il piede conferma «1 righe valide». La riga vuota non blocca il salvataggio (per §13 le righe senza articolo sono tollerate) ma resta rumore: l'operatore deve togliersela di mezzo o convivere con una riga fantasma numerata 1. Il form applica `trimDuplicateTrailingEmptyRows()`, che pota solo le righe vuote in coda, mentre qui la riga vuota è quella iniziale e le righe dell'ordine le vengono accodate.

**Evidenza:** Log test: «[arrivo] righe precompilate: 2» · «[arrivo] riga 0: prodotto="" sku="" qty="1" costo=""» · «[arrivo] riga 1: prodotto="E2E-FOR-SKU-1" qty="4" costo="10,00"». Screenshot: docs/test-results/screenshots-local/for-arrivo-merce-precompilato.png.

**Verifica indipendente:** Riprodotto due volte (test D4/D6): «[D4/D6] righe precompilate: 2» · «riga 0: prodotto="" codice="" qty="1"» · «riga 1: prodotto="E2E-VER-FOR-SKU-1" qty="4"». La riga vuota è la numero 1 e precede quella dell'ordine, quindi trimDuplicateTrailingEmptyRows() — che pota solo la coda — non la tocca.

---

### P3.25 · Lista Ordini fornitori: i filtri «fornitore» e «periodo» promessi da §9.2 non esistono

**Area:** Fornitori · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. /app/orders.
2. Elencare i filtri della toolbar (chip e pannello «Filtri» mobile).

**Atteso:** DOCUMENTO-FUNZIONALE §9.2: «Filtri lista: stato, fornitore, periodo, ricerca». Anche PIANO-TEST T-120 chiede «filtri stato / fornitore / ricerca».

**Osservato:** Esiste solo il filtro «Stato» (Tutti · Confermato · Concluso · Annullato) più la ricerca libera per riferimento o fornitore. Nessun filtro per fornitore e nessun filtro per periodo, né nella toolbar desktop né nel pannello mobile. La persistenza in URL invece funziona correttamente (`?status=cancelled&search=…` sopravvive al reload), quindi l'invariante §20.10 è rispettata per i filtri esistenti.

**Evidenza:** Log test: «[lista] filtri disponibili: ["Filtra per stato ordine"]» · «[lista] stati offerti: ["Tutti","Confermato","Concluso","Annullato"]» · «[lista] url dopo filtro stato: http://localhost:4200/app/orders?status=cancelled» · «[lista] url dopo reload: …?status=cancelled&search=E2E-FOR-inesistente-zzz». Screenshot: docs/test-results/screenshots-local/for-lista-ordini-filtri.png. Sorgente: src/app/features/orders/supplier-order-list.component.html (un solo app-select-menu di filtro).

**Verifica indipendente:** Riprodotto due volte (test D7) enumerando a runtime tutti i select-menu della pagina: «[D7] select-menu presenti in pagina: ["Filtra per stato ordine","Righe per pagina"]» e «campi data nella toolbar: 0» (nessun app-date-input né input[type=date]). Il testo del documento è verificato alla lettera — docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md riga 313: «Filtri lista: stato, fornitore, periodo, ricerca».

---

### P3.26 · PIANO-TEST §12 descrive un flusso ordine fornitore che non esiste più (Invia ordine, Parzialmente ricevuto, colonna «In arrivo»)

**Area:** Fornitori · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/70-fornitori-ordini.spec.ts`

**Passi**

1. Leggere docs/PIANO-TEST-VESTIFLOW.md, casi T-122 e T-123.
2. Confrontare con l'app: dettaglio ordine /app/orders/<id> e colonne di /app/inventory.

**Atteso:** Il piano di test è l'elenco dei casi da eseguire: dovrebbe descrivere il flusso reale.

**Osservato:** T-122 «Invia ordine» chiede un ordine «in bozza» e un pulsante «Invia ordine»: non esistono (l'ordine nasce Confermato, gli stati sono Confermato · Concluso · Annullato). T-123 chiede il pulsante «Registra arrivo merce» (nell'app è «Crea arrivo merce»), lo stato finale «Parzialmente ricevuto o Completato» (non esistono) e «Colonna In arrivo aggiornata»: la colonna «In arrivo» non è tra quelle mostrate di default in /app/inventory e, per DOCUMENTO-FUNZIONALE §20.6, gli ordini fornitore non la alimentano più (verificato: incoming resta 0 in ogni fase). L'app è quindi allineata al DOCUMENTO-FUNZIONALE §9/§20.6 ed è il piano di test a essere fermo alla versione precedente.

**Evidenza:** Log test: «[esplora] colonne giacenze: Articolo | Codice | Location | Disponibile | Giacenza | Impegnata | Stato» · «[invariante] dopo l'ordine: onHand=6 incoming=0 (prima onHand=6)» · «[stati] azioni su Concluso: Scarica PDF». Etichette stati da src/app/features/orders/models/supplier-order-labels.util.ts (Confermato/Concluso/Annullato).

**Verifica indipendente:** Riprodotto (test D8/D8-bis) e riscontrato sui documenti. Runtime: «[D8] stati offerti dal filtro: ["Tutti","Confermato","Concluso","Annullato"]» — nessuna bozza, nessun «Inviato», nessun «Parzialmente ricevuto»; «[D8] colonne giacenze: Articolo | Codice | Location | Disponibile | Giacenza | Impegnata | Stato». Documenti: PIANO-TEST T-122 chiede «dal dettaglio ordine in bozza clicca Invia ordine», T-123 ha come prerequisito «ordine fornitore Inviato (T-122)» e chiede «Registra arrivo merce» (nell'app «Crea arrivo merce»). Verificata anche la precisazione sulla colonna: inventory-levels-table-columns.config.ts la dichiara «{ id: 'incoming', label: 'In arrivo', defaultVisible: false }» — esiste ma è nascosta, e §7.1 del DOCUMENTO-FUNZIONALE dice che «gli ordini fornitore non la alimentano più».

---

### P3.27 · DELETE /api/v1/products/:id risponde 500 «Errore interno del server» su articoli rimasti dopo un arrivo merce eliminato

**Area:** Documenti · **Tipo:** bug · **Spec:** `e2e-local/80-documenti.spec.ts`

**Passi**

1. Crea un articolo (prefisso E2E-DOC-) con una variante.
2. Registra un arrivo merce su quell'articolo e salvalo (la giacenza sale).
3. Elimina il documento di arrivo merce: DELETE /api/v1/documents/:id → 200, la giacenza torna a 0 e i movimenti spariscono (verificato: GET /inventory/movements?variantId=… → 0 elementi, /inventory/levels → onHand 0).
4. Elimina l'articolo: DELETE /api/v1/products/:id.

**Atteso:** 204 (come accade per gli articoli identici passati dallo stesso flusso) oppure, se qualcosa lo trattiene, un 409 con messaggio parlante — l'API ne ha già uno: «Il prodotto ha movimenti di magazzino registrati: archivialo invece di eliminarlo.»

**Osservato:** 500 con corpo {"statusCode":500,"message":"Errore interno del server"}, senza alcuna indicazione della causa. Riproducibile: 5 tentativi su 2 articoli distinti, tutti 500, a distanza di un'ora e dopo un riavvio dell'API. Non è il caso «ha movimenti»: quel caso restituisce 409 con messaggio chiaro, ed è stato osservato in parallelo su un terzo articolo. I due articoli sono rimasti nel tenant (li ho archiviati). Nota: durante la stessa sessione l'API si è resa irraggiungibile per ~70 s (ECONNREFUSED su :3000) subito dopo uno di questi 500, poi è tornata da sola; non ho elementi per affermare che il 500 e la caduta siano lo stesso problema.

**Evidenza:** Output della pulizia:
[prod] E2E-DOC-Articolo 94296434 status=archived id=7febd59a-bf7d-4cc1-b6b7-82c634326221 delete=500
[prod] E2E-DOC-Articolo 95071415 status=archived id=8b67ded9-7490-43af-9a01-f1c91cdd09c1 delete=500
[delete #1] 500 {"statusCode":500,"message":"Errore interno del server"}
[delete #2] 500 {"statusCode":500,"message":"Errore interno del server"}
[delete #3] 500 {"statusCode":500,"message":"Errore interno del server"}
A confronto, stessa richiesta su un articolo con movimenti: 409 {"message":"Il prodotto ha movimenti di magazzino registrati: archivialo invece di eliminarlo."}

**Verifica indipendente:** Il difetto esiste ed è deterministico, ma i passi riportati NON lo riproducono: rifatto identico (test D3 — articolo con una variante via POST /products, arrivo merce con riga loadsStock:true qty 3, DELETE /documents -> 200, movimenti residui 0, giacenza tornata a 0) il DELETE /products ha risposto 204 al primo tentativo. Ho quindi cercato il discriminante con tre varianti a confronto (test D3b, eseguito due volte con esito identico): (A) riga documento senza carico magazzino, documento vivo -> 204; (C) riga con carico e documento vivo -> 409 con il messaggio parlante sui movimenti, e dopo l'eliminazione del documento -> 204; (B) riga con carico E CODICE LOTTO, documento eliminato (200) -> 500 {"statusCode":500,"message":"Errore interno del server"}, riproducibile su articoli distinti in due esecuzioni. Il trigger è quindi il lotto: l'eliminazione del documento non rimuove la riga InventoryLot, che in schema.prisma referenzia ProductVariant senza onDelete (quindi Restrict), e la violazione di vincolo esce come eccezione non gestita invece che come 409 parlante — lo stesso vale per InventorySerial, ShopifyInventorySyncState e InventoryCountLine, tutti Restrict.

---

### P3.28 · L'hub Documenti non ha la voce «Inventario» che il documento funzionale §10.1 elenca sotto Magazzino

**Area:** Documenti · **Tipo:** divergenza-documentazione · **Spec:** `e2e-local/80-documenti.spec.ts`

**Passi**

1. Vai su /app/documents.
2. Leggi i gruppi e le card: «Acquisti e fornitori», «Magazzino», «Vendite», «Registro».
3. Nel gruppo Magazzino conta le voci.

**Atteso:** Secondo docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md §10.1 il gruppo Magazzino contiene: Trasferimenti · Rettifiche · Vendite manuali · **Inventario (registro filtrato)**. Il tipo documento `inventory` esiste (§10.2) e nel tenant ci sono documenti INV-000x visibili nel registro generico.

**Osservato:** Il gruppo Magazzino ha solo tre voci: «Trasferimenti» (/app/documents/registro?type=transfer), «Rettifiche di magazzino» (/app/documents/registro?type=adjustment), «Vendita manuale» (/app/documents/manual-unload). Nessuna voce «Inventario», nemmeno disabilitata con l'etichetta «Presto»: il sorgente documents-hub.component.ts non contiene alcuna occorrenza di «Inventario»/«inventory». Ai documenti di inventario si arriva solo dal registro generico filtrando a mano. Nessuna delle 14 voci presenti è rotta.

**Evidenza:** Output del test «hub documenti: ogni voce porta a una pagina viva» — 14 card, tutte con h1 e senza app-error-state; elenco completo: Ordini fornitore, Arrivi merce, Registrazione fattura fornitore, Trasferimenti, Rettifiche di magazzino, Vendita manuale, Ordini cliente, Vendita al banco, Vendita/Reso in negozio, Proforma, DDT vendita, Fatture, Preventivi, Tutti i documenti. Verifica sul sorgente: `grep -n "Inventario|inventory" src/app/features/documents/documents-hub.component.ts` → nessun risultato.

**Verifica indipendente:** Riprodotto con script indipendente (test D4): l'hub /app/documents non contiene la parola «Inventario» in nessun punto del testo di pagina, e il gruppo Magazzino ha solo Trasferimenti (/registro?type=transfer), Rettifiche di magazzino (/registro?type=adjustment) e Vendita manuale (/app/documents/manual-unload). Il tipo esiste davvero e ha dati: /app/documents/registro?type=inventory risponde «6 documenti». Il documento funzionale §10.1 (riga 324) elenca invece «Magazzino: Trasferimenti · Rettifiche (registri filtrati) · Vendite manuali · Inventario (registro filtrato)». Nessuna occorrenza di Inventario/inventory nel sorgente documents-hub.component.ts.

---
