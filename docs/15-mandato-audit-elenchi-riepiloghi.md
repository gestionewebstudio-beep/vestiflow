# 15 · Mandato — audit e unificazione di elenchi, riepiloghi e griglie

**Stato:** mandato operativo, **audit non ancora eseguito**
**Consegnato dal proprietario il 26/08/2026.**

> ⚠️ **Il testo di questo mandato è stato scritto da GPT, non misurato sul codice.**
> Il proprietario lo ha dichiarato consegnandolo: _«Il file l'ha creato gpt e non è detto
> che tutto sia corretto»_. Va quindi trattato come **richiesta di prodotto**, non come
> fotografia dell'esistente: dove afferma che qualcosa manca o è duplicato, la cosa va
> **verificata**, non assunta.

⛔ **Nessuna modifica al codice prima dell'esito dell'audit e dell'approvazione.**

---

## 1. Perché esiste questo lavoro

VestiFlow ha diverse schermate di elenco/riepilogo con maturità differente: **Ordini
cliente** (elenco documentale con ricerca, filtri, selezione, azioni di massa),
**Corrispettivi** (registro economico con fascia riepilogativa), **Movimenti** (eventi
fisici di magazzino). **Danea Easyfatt** è usato solo come benchmark UX.

L'obiettivo **non** è rendere le schermate identiche:

> **Condividere una sola volta ciò che è realmente infrastruttura comune, condividere per
> famiglia ciò che ha lo stesso significato di dominio, lasciare specifico ciò che è
> veramente diverso.**

Il rischio è doppio: copiare lo stesso guscio in ogni pagina, **oppure** creare un
«riepilogo universale» che fonde documenti, registri economici e movimenti pur avendo
semantiche diverse.

## 2. Metodo

1. leggere le fonti correnti; 2. ispezionare l'implementazione reale; 3. distinguere sempre
   **regola richiesta** / **comportamento osservato** / **ipotesi tecnica**; 4. individuare la
   causa radice; 5. proporre; 6. **fermarsi per approvazione**.

> Il codice corrente non è automaticamente corretto solo perché compila, passa i test o usa
> componenti già esistenti.

Le schermate fornite e Danea sono **benchmark funzionali/UX**, non prova del modello dati
interno. Le decisioni recenti del proprietario prevalgono su specifiche più vecchie.

## 3. La struttura a tre livelli

```text
┌─────────────────────────────────────────────────────────────┐
│                  LIVELLO 1 — SHELL COMUNE                   │
│ breadcrumb · indietro · titolo · conteggio · CTA            │
│ ricerca · area filtri · azioni · Colonne                    │
│ contenitore · responsive · loading/empty/error              │
└──────────────────────────┬──────────────────────────────────┘
┌──────────────────────────┴──────────────────────────────────┐
│             LIVELLO 2 — MOTORE GRIGLIA COMUNE               │
│ colonne visibili · ordinamento · larghezze · resize         │
│ ordine colonne · formattazione · selezione opzionale        │
│ persistenza layout · paginazione · accessibilità            │
└──────────────────────────┬──────────────────────────────────┘
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ DOCUMENTI     │  │ REGISTRI        │  │ MOVIMENTI       │
│ righe doc.    │  │ ECONOMICI       │  │ eventi fisici   │
│ filtri doc.   │  │ eventi econ.    │  │ quantità        │
│ azioni doc.   │  │ totali e segni  │  │ origine doc.    │
└───────────────┘  └─────────────────┘  └─────────────────┘
```

> **shell e capacità tecniche comuni = condivise trasversalmente**
> **riga e regole di dominio = condivise solo quando semanticamente uguali**
> **configurazione della singola pagina = specifica del modulo**

⚠️ I nomi dei componenti **non sono prescritti**: vanno verificati contro ciò che esiste.

---

## 4. Livello 1 — la shell

Candidati alla condivisione: breadcrumb, indietro, titolo, conteggio, CTA primaria,
ricerca, barra filtri, comando **Colonne**, azioni Stampa/PDF/Excel/CSV, contenitore
tabella, contatore righe, loading, empty state, error state, responsive, token visuali.

⭐ **Comune non significa sempre visibile.** Un registro può avere export e nessuna CTA
«Nuovo»; un elenco documenti può avere selezione multipla; Movimenti può non avere le
azioni dei documenti. **La shell offre capacità e slot, non obbliga a usarli tutti.**

## 5. Livello 2 — il motore griglia

### 5.1 Colonne attivabili

Il comando **Colonne** mostra il catalogo della vista. Da verificare/progettare: colonna
disponibile, visibilità corrente, preset iniziale, colonna obbligatoria (solo con un
motivo), ripristino preset, compatibilità con moduli opzionali.

⛔ **Regola Shopify**: un tenant senza modulo Shopify **non deve vedere colonne Shopify
neppure nel selettore Colonne**.

### 5.2 Ordinamento

Una sola infrastruttura. Requisiti: asc/desc, indicatore, reset, ordinamento backend o
frontend secondo il volume, coerenza con paginazione **e con export**, stabilità a parità
di valore, semantica corretta per date/numeri/stringhe/stati.

### 5.3 Larghezze

Resize con drag, larghezza minima, eventuale massima, larghezza base canonica, overflow,
tooltip sul troncato, comportamento su viewport ridotti, **persistenza**.

### 5.4 Ordine delle colonne

Se implementato, deve essere comune e persistente. **Mai introdotto in una sola schermata.**

### 5.5 Persistenza del layout

`visibleColumns` · `columnOrder` · `columnWidths` · `sort` · eventuale grouping.
Da verificare: esiste già? per utente o per tenant? per tipo di vista? solo local storage?
sincronizzato? esistono implementazioni parallele?

⛔ **Non scegliere il modello di persistenza senza audit del codice.**

### 5.6 Formattatori

Una sola definizione per: data, data/ora, valuta, quantità, percentuale, negativi,
placeholder per dato assente, testo troncato, badge di stato **quando semanticamente
equivalente**.

⚠️ **Stesso aspetto non significa stessa semantica**: lo `Stato` di un Ordine cliente non
è lo `Stato` di un pagamento.

## 6. Livello 3 — le famiglie

### 6.1 Famiglia A — elenchi documentali

Ordini cliente, Preventivi, DDT, Fatture, Fatture accompagnatorie, Note di credito, Ordini
fornitore, Arrivi merce, Vendite al banco, Resi al banco.

Regola già consolidata da preservare:

> Il clic sulla riga porta alla **modifica**; il Dettaglio è un'azione separata.

### 6.2 Famiglia B — registri economici (Corrispettivi)

Una riga rappresenta un **evento economico** (vendita, reso, rimborso/rettifica), non un
documento. **Non va forzata nel modello della riga documento.**

La fascia riepilogativa economica **non è il footer universale di tutte le liste**: è
contenuto specifico del dominio, reso dentro un eventuale contenitore comune per metriche.

⛔ **Regola critica**: filtri, righe, conteggio, riepilogo, export e stampa devono riferirsi
allo **stesso perimetro economico**.

⚠️ Non assumere che il Registro debba essere calcolato live. Distinguere: source of truth ·
query · projection/read model · cache · vista SQL · aggregazione · duplicazione autonoma.
**Una projection derivata, idempotente e ricostruibile non è automaticamente un secondo
source of truth.**

### 6.3 Famiglia C — movimenti di magazzino

Eventi **fisici**: quantità, location, origine. Condivisibili: shell, ricerca, filtri,
Colonne, sorting, resize, persistenza, formattazione, export.
⛔ **Da NON forzare dal mondo documenti**: stato documento, pagamento, evasione, totale
documento, azioni documento.

### 6.4 Famiglia D — report/analisi

Non assumere che siano «un'altra tabella». Per ognuno verificare se usa la stessa sorgente,
lo stesso filtro, lo stesso motore economico, la stessa logica IVA, **lo stesso segno** per
resi/note di credito/rimborsi, lo stesso dataset dell'export.

---

## 7. Filtri — infrastruttura comune, contenuto specifico

| Vista                       | Filtri osservati                                                               |
| --------------------------- | ------------------------------------------------------------------------------ |
| Ordini cliente              | Periodo · Stato · Origine · Pagamento · Evasione · Cliente · Location          |
| Corrispettivi               | Periodo · Origine · Tipo · Sede · Raggruppa                                    |
| Movimenti _(da verificare)_ | Periodo · Tipo movimento · Location · Prodotto · Documento origine · Operatore |

⛔ **Non aggiungere filtri «per uniformità».** Ogni filtro esiste perché ha significato nel
dataset.

**Preset Periodo** — candidato forte a contratto comune: ultimi 7 gg, ultimi 30 gg, mese
corrente, mese precedente, anno corrente, anno precedente, trimestre, personalizzato, e
«tutti» **solo dove funzionalmente sensato**.
⚠️ Non caricare l'intera storia quando il dominio richiede un periodo operativo.

## 8. Ricerca

La shell offre la ricerca; **la query è specifica della vista**. Verificare: debounce,
cancellazione, sincronizzazione coi filtri, query server-side, paginazione, ordinamento,
stato URL, reset.

## 9. Fascia riepilogativa

Distinguere **contenitore visuale comune per metriche** da **metriche e formule del dominio**.

⛔ **Regola economica critica**:

> I totali del documento derivano dalla somma dei valori finali delle righe secondo il
> contratto economico corrente. **Non creare motori alternativi** che ricalcolano
> arbitrariamente `quantità × prezzo × IVA` in un report se esistono snapshot canonici.

Durante l'audit **segnalare ogni riepilogo che implementa un secondo motore economico**.

## 10. Export e stampa

> Stesso filtro + stesso perimetro devono produrre un export coerente con ciò che l'utente
> sta consultando, salvo differenza esplicitamente prevista dal dominio.

Verificare: filtri applicati, colonne, ordine, segni economici, IVA, totali, tenant,
location, encoding, **export di tutte le righe filtrate vs sola pagina visibile**, calcoli
autonomi duplicati.

## 11. Token e CSS

⛔ **Non copiare CSS pagina per pagina.** Censire token globali, variabili CSS, classi
duplicate, valori hard-coded equivalenti, breakpoint duplicati.
⚠️ Non forzare Corrispettivi come unico stile se il design system ha già token più canonici.

## 12. Il censimento richiesto

Shell elenco · breadcrumb/header · ricerca · filter bar · period filter · Colonne · sorting ·
resize · column order · persistenza layout · tabelle/grid · selezione righe · summary/footer ·
export · stampa/PDF · token/CSS · mobile · loading/empty/error · backend list query ·
aggregazioni · tenant/location.

**Per ogni voce: file e simbolo concreto, non una descrizione generica.**

## 13. Classificazione obbligatoria

```text
✅ GIÀ CONDIVISO CORRETTAMENTE     una sola infrastruttura realmente riusata
⭐ COMUNE ESISTENTE MA AGGIRATO    la soluzione c'è, alcune pagine la duplicano
⚠️ DUPLICAZIONE TECNICA            stesso comportamento implementato più volte
⛔ DUPLICAZIONE DI REGOLA          stesso calcolo/segno/filtro più volte, esiti divergenti
🔵 DIFFERENZA REALE DI DOMINIO     devono restare differenti o configurabili
🟡 DA DECIDERE                     il codice non basta: serve l'owner
🧹 LEGACY / CODICE MORTO           nessun consumer verificato
```

## 14. Controlli importanti

- **Non confondere markup condiviso con logica condivisa**: due tabelle uguali possono avere
  domini diversi; due pagine diverse possono duplicare lo stesso motore.
- ⛔ **Niente `if (type === …)` incontrollati nel componente comune.** Se la differenza è
  dato/policy → **configurazione della vista**; se è dominio → **contratto di famiglia**.
- **Filtri e riepilogo coerenti**: conteggio, summary, export e stampa sullo stesso perimetro.
- **Ordinamento e paginazione**: non accettare «il frontend ordina le venti righe caricate»
  se la UI presenta l'ordinamento come globale.
- **Tenant e location**: ogni query, filtro, riepilogo ed export rispetta il tenant. La
  location si applica **solo dove il dominio la possiede**; ⛔ non inventare «Non determinata».

## 15. Cosa NON fare in questa fase

Non modificare componenti, non rinominare, non spostare cartelle, non creare shared
components, non convertire tabelle, non cambiare filtri/formule/query/DB, non creare
migration, non introdurre librerie grid esterne, non fare replace massivi CSS, non uniformare
righe solo perché visivamente simili, non usare Corrispettivi come modello dati universale,
non usare Danea come prova di architettura interna, **non fare push/merge/deploy**.

## 16. Output richiesto

**A.** sintesi esecutiva (≤ 20 righe) · **B.** mappa delle viste · **C.** mappa
componenti/servizi · **D.** matrice duplicazioni · **E.** famiglie proposte · **F.**
architettura proposta · **G.** piano di intervento (solo proposta, con punti di stop).

## 17. Test da prevedere nel futuro refactor

Colonne (toggle, colonna non prevista, Shopify assente, preset, persistenza) · Sorting
(asc/desc, dataset paginato ordinato globalmente, export coerente) · Resize (min-width,
persistenza, responsive) · Filtri (combinazione, reset, conteggio, tenant/location, export
= perimetro) · Selezione (checkbox non apre il documento, clic riga apre modifica, barra solo
con selezione) · Corrispettivi (vendite/resi/rimborsi una volta sola, segni, summary =
dataset, export = summary) · Movimenti (quantità e location, documento/riga origine) ·
Regressione (una vista per famiglia, desktop e mobile, loading/empty/error).

## 18. Criterio di successo

L'audit è concluso solo quando si risponde **con evidenza** a queste quindici domande:

1. Quanti shell/list layout equivalenti esistono?
2. Quanti motori di tabella/griglia equivalenti?
3. Quanti sistemi Colonne?
4. Quanti sistemi di sorting?
5. Esiste già il resize? Dove?
6. Come vengono salvate le preferenze di griglia?
7. Quante filter bar equivalenti?
8. Quanti motori Periodo?
9. Quanti summary/footer?
10. Quanti motori economici equivalenti?
11. Quanti export ricalcolano autonomamente i dati?
12. Quali differenze sono davvero dominio?
13. Quali componenti comuni esistono ma vengono aggirati?
14. Qual è la minima architettura comune necessaria?
15. Quali refactor possono produrre regressioni trasversali?

⛔ **Se una risposta non è verificabile dal codice, va dichiarata «non verificabile» invece
che dedotta.**

## 19. Principio finale

```text
             INFRASTRUTTURA COMUNE
      shell · grid · columns · filters · tokens
                       ↓
             CONTRATTI PER FAMIGLIA
          documenti · registri · movimenti
                       ↓
              CONFIGURAZIONE VISTA
        colonne · filtri · azioni · metriche
```

> **Condividere il meccanismo. Condividere il significato solo quando è davvero lo stesso.
> Configurare le differenze. Non duplicare la stessa regola. Non fondere domini diversi.**

---

**STOP DOPO L'AUDIT.** Censimento, cause radice e proposta. Nessun refactor senza approvazione.
