# 10 · Specifica — Struttura Vendite e Registro Corrispettivi

**Fonte:** nota funzionale del proprietario del progetto, 16/08/2026. Questo file è la
**specifica corrente** del Registro Corrispettivi: in caso di conflitto con testi precedenti
(`08`, `ORDINI-CANALE-ESTERNO`, guide) vale questo.

---

## §1 · Principio

> **Il Registro Corrispettivi è la vista economica generale derivata delle vendite e delle
> rettifiche che VestiFlow conosce.**

L'operatore vede il quadro completo e ottiene i sottoinsiemi con i **filtri**, non con archivi
o flussi paralleli. È lo stesso criterio già in uso nell'area Ordini:

| Livello             | Esempio                                             |
| ------------------- | --------------------------------------------------- |
| archivio generale   | **Ordini cliente**                                  |
| vista specializzata | **Vendite online**, **Ordini Shopify**              |
| registro economico  | **Corrispettivi** — generale, con filtri per ambito |

`Vendite online` e `Ordini Shopify` restano viste specializzate: **non** sono archivi economici
alternativi al Registro.

---

## §2 · Cosa contiene

Senza filtri, il Registro rappresenta **tutte** le vendite e le rettifiche economicamente
rilevanti, **mantenendo l'origine dell'evento**: vendite negozio VestiFlow, Shopify POS
(fisico), Shopify ecommerce, canali futuri (es. TikTok Shop), resi, rimborsi e rettifiche.

### La regola che evita l'errore più facile

> **Visibilità nel registro ≠ partecipazione a uno specifico totale o export.**

Una vendita può restare **consultabile** nel quadro generale ed essere **esclusa** da un
determinato riepilogo, in base alla regola economica o al filtro applicato.

Che una vendita fisica sia già certificata da una cassa o da un RT esterno **non significa che
debba sparire** dal quadro economico interno: deve restare visibile **una volta sola** e
correttamente classificata.

**Il doppio conteggio esiste solo se la stessa transazione è rappresentata due volte dentro
VestiFlow.** La certificazione esterna non è una seconda rappresentazione.

---

## §3 · Filtri

Il Registro non crea archivi separati per canale. I sottoinsiemi si ottengono con:

| Filtro           | Valori                                                      |
| ---------------- | ----------------------------------------------------------- |
| **Periodo**      | preset + intervallo personalizzato                          |
| **Ambito**       | Tutti · Online · Fisico/POS                                 |
| **Canale**       | Tutti · Shopify · VestiFlow · canali futuri                 |
| **Tipo evento**  | Vendita · Reso · Rimborso/rettifica                         |
| **Fatturazione** | fatturato / non fatturato — **mai** come flusso di consegna |

L'operatore inesperto entra e vede il quadro generale. Chi sa cosa cerca sceglie periodo e
filtri, poi stampa o esporta **quel** sottoinsieme.

**Stato al 16/08, sera:** Periodo, **Ambito**, **Canale** e Tipo evento ci sono — ambito e
canale come **dimensioni distinte derivate dall’origine** (`11` §21). Resta fuori la sola
**Fatturazione** —
vedi §7.

---

## §4 · Shopify POS

> **Shopify POS compare nel Registro generale, classificato come vendita fisica/POS.**

Non è escluso in assoluto. Se un riepilogo deve contenere il solo ecommerce, è **il filtro o la
regola del riepilogo** a escludere il fisico — non un'etichetta sulla vendita.

Il dato che la classifica è la sua **origine** (`sales_orders.source`), che è un **fatto**
scritto alla creazione, non uno stato da ricordarsi di aggiornare:

| `source`         | Ambito     |
| ---------------- | ---------- |
| `shopify_online` | Online     |
| `shopify_pos`    | Fisico/POS |
| `store`          | Fisico/POS |
| `manual`         | —          |

### La duplicazione: verificata il 16/08, non c'è

Un ordine Shopify POS importato **non** genera anche una Vendita negozio VestiFlow. Le vendite
negozio nascono **solo** da `POST /store-sales`, un gesto esplicito dell'operatore alla cassa;
la sync Shopify crea un `SalesOrder` e basta. **Una transazione, una rappresentazione.**

⚠️ Se un giorno le rappresentazioni diventassero due, si corregge **la duplicazione alla causa
radice** — non si esclude indiscriminatamente tutto Shopify POS.

---

## §5 · Nessun flusso «commercialista»

> **VestiFlow non sa se i Corrispettivi sono stati inviati, consegnati o registrati dal
> commercialista.**

Il ciclo è: **periodo → filtri → stampa/CSV/export → fine.**

Quindi **nessuno** stato «da inviare», «inviato», «consegnato», «registrato esternamente»;
nessuno storico consegne; stampa ed export **non modificano stati né classificazioni**; lo
stesso periodo si esporta quante volte serve.

Il Registro è un **registro economico interno derivato**, non un documento gestionale
modificabile.

_Attuato il 16/08: rimossi `markDelivered`, lo storico consegne, il pannello, il filtro «solo da
consegnare», e le colonne «Stato fiscale» e «Data consegna commercialista» dall'export._

---

## §6 · `SalesOrderFiscalStatus` — rimosso

Il modello `sales_orders.fiscal_status` è stato **eliminato per intero** il 16/08/2026, colonna
e tipo PostgreSQL. Non è stato sostituito da nessun enum.

| Valore                    | Perché è caduto                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `delivered_to_accountant` | flusso commercialista, ritirato (§5)                                                           |
| `externally_registered`   | idem — **da non confondere** con l'omonimo di `DocumentStatus`                                 |
| `pending_registration`    | era il «non ancora consegnato»: senza il flusso, un default che non cambia mai                 |
| `excluded_pos_register`   | esprimeva l'esclusione del POS: **la decisione è l'opposta** (§4), e non era mai stato scritto |
| `invoiced`                | nessun producer, mai                                                                           |

**Nessun dato perso:** tutte e 37 le vendite portavano `pending_registration`, il default.

> **Le regole di inclusione, classificazione ed esclusione derivano da dati canonici e
> verificabili** — origine, canale, ambito, tipo evento, relazione reale con un documento
> fiscale — **non da un secondo flusso fiscale parallelo sulla vendita.**

---

## §7 · `CorrispettivoEntry` non è la sorgente

⚠️ **Correzione di una premessa sbagliata**, affermata due volte il 15 e 16/08 e smentita dal
censimento.

`CorrispettivoEntry` / `corrispettivo_entries` **non è la sorgente canonica del Registro**. Il
Registro attuale è **derivato direttamente dalle sorgenti vive**; quella tabella **non viene più
scritta da nessuno** dall'11/08 (`08` §10), e le sue righe residue — 6, al 16/08 — sono storia.

**Non si deduce la logica nuova da quelle righe.** In particolare non va più detto che
l'esclusione dei fatturati «vive» in `CorrispettivoEntry.excludedFromSummary`: era vero quando
la tabella si scriveva, non lo è ora.

> **Le esclusioni dai riepiloghi si determinano dalle sorgenti e dalle relazioni canoniche vive
> nel sistema, non da stati o tabelle storiche non più alimentate.**

### Conseguenza aperta, misurata e non chiusa

Oggi **nessuna esclusione è implementata**: il Registro seleziona le vendite evase e non guarda
né origine né documenti fiscali. Le due che serviranno:

1. **fatturato** — una vendita già fatturata non deve rientrare nei totali dove produrrebbe
   doppio conteggio: va determinata dalla **relazione reale col documento**;
2. **le vendite negozio VestiFlow** oggi **non entrano affatto** nel Registro — specifica
   dedicata in **`11-specifica-vendita-al-banco.md`**, che decide il risultato (`Fisico/POS ·
VestiFlow`) e lascia aperto il meccanismo. Sono `Document`
   di tipo `store_sale`, non `SalesOrder`, e il Registro aggrega solo i secondi. Il §2 dice che
   devono esserci.

Entrambe cambiano **cosa il Registro mostra**: sono lavoro proprio, non rifinitura.

---

## §8 · UI

| Prima                                    | Ora                                             |
| ---------------------------------------- | ----------------------------------------------- |
| «Corrispettivi commercialista»           | **«Corrispettivi»** (schermata e stampa)        |
| sottotitolo su «vendite online Shopify»  | quadro economico di vendite e rettifiche        |
| filtro «Tutti gli stati fiscali»         | **rimosso**                                     |
| filtro canale: Tutti · Shopify · Negozio | **ambito**: Tutti · **Online** · **Fisico/POS** |
| colonna «Stato fiscale» in tabella       | **rimossa**                                     |

⚠️ Le due etichette vecchie del filtro **dicevano il falso**: «Shopify» comprendeva le sole
vendite online — anche il POS è Shopify — e «Negozio» indicava lo **Shopify POS**, non la cassa
di VestiFlow.

**Restano separate in navigazione** — hanno scopi diversi e non sono duplicati:
**Vendite online** · **Corrispettivi** · **Ordini Shopify**.

---

## §9 · Regola sintetica

> **Corrispettivi = quadro economico generale derivato.**
>
> Ogni vendita o rettifica che VestiFlow conosce resta consultabile **una sola volta**,
> classificata per origine. I sottoinsiemi si ottengono con filtri e riepiloghi.
>
> **Shopify POS resta visibile come fisico/POS**; non si esclude in assoluto.
>
> **Nessuna stampa, esportazione o consegna genera stati.**

---

## §10 · La guardia

`scripts/check-registro-legacy.mjs`, dentro `npm run lint`, attraversa **API, frontend ed e2e**
e fallisce se rientra uno dei 14 termini ritirati — `fiscalStatus`, `markDelivered`,
`excluded_pos_register`, `registerExternal`, `accountant-register`, …

Esiste perché **niente di tutto questo si romperebbe tornando**: un `fiscalStatus` riaggiunto a
un DTO compila, passa i test e non fa arrossare nulla. Ricostruisce solo un modello che abbiamo
deciso di non avere. Le decisioni funzionali non hanno un compilatore.

I commenti che **raccontano** la rimozione sono esentati: vietare anche quelli costringerebbe a
cancellare la spiegazione.
