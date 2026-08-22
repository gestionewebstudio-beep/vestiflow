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

## La mappa: quale documento governa cosa

| Documento                                 | Governa                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `01-registro-difetti-shopify`             | i difetti aperti dell'integrazione Shopify                     |
| `02-specifica-sincronizzazione-shopify`   | come si sincronizza, chi possiede il dato                      |
| `03` + `03b`                              | righe documento unificate, tastiera, U.M., ricerca             |
| `04-specifica-numerazione-documenti`      | progressivi, serie, anno, indice unico                         |
| `06b` · `07` · `QUADRO-DECISIONI-FATTURE` | famiglia Fattura (fattura, accompagnatoria, nota di credito)   |
| `08` · `10`                               | resi e annullamenti di canale · Registro Corrispettivi         |
| `09-specifica-movimenti-per-riga`         | un movimento per riga documento, aggiornato in posto           |
| `11-specifica-vendita-al-banco`           | Vendita e Reso al banco                                        |
| `12-specifica-collegamenti-documentali`   | «Includi» e «Genera» fra documenti, effetti a magazzino        |
| `13-specifica-prestazioni-salvataggio`    | prestazioni del salvataggio e pipeline inventario (C4)         |
| `14-specifica-elenchi-documenti`          | **elenchi e riepiloghi**: apertura, selezione, azioni, tabella |
| `.claude/rules/regole-*`                  | le regole permanenti: architettura, dominio, stile, sicurezza  |

⚠️ **`PIANO-TEST`, `GUIDA-*`, `DA-FARE*`, `GUARDIE-MANCANTI` non sono specifiche**: sono
strumenti di lavoro. Non ci si cercano decisioni.

---

## Elenchi e riepiloghi — `14`

| Decisione                                                                                                                  | Dove     |
| -------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Clic sulla riga → Modifica**, per ogni tipo e in ogni elenco. Nessun doppio clic                                         | §2, §3   |
| **Checkbox → selezione**: gesto distinto, non alternativo                                                                  | §4       |
| **Tre funzioni distinte: Modifica · Dettaglio · Stampa/PDF.** «Anteprima» non esiste                                       | §6       |
| Il **Dettaglio** si raggiunge dal suo pulsante e in questa fase non si ridisegna                                           | §E4      |
| **Tre predicati da non confondere**: `canEdit` · `canViewDetail` · `canSelect`                                             | §H16     |
| **Riga selezionata**: cambio di sfondo comune. **Mano**: solo dove il clic apre la Modifica                                | §H16     |
| La **barra azioni è permanente**: la selezione ne cambia l'ambito, non la presenza                                         | §5       |
| **La selezione batte i filtri**: 0 selezionati → il filtrato; 1+ → solo quelle                                             | §5.3     |
| **Stampa · Excel · Esporta** sono tre azioni indipendenti                                                                  | §5.2     |
| **«Esporta» richiede `reports.export`** ovunque sia disponibile                                                            | §E5      |
| **I riepiloghi non impaginano**: si aprono sugli ultimi 30 giorni, «Tutti» resta una voce                                  | §H14-bis |
| **Le anagrafiche restano paginate**: senza un asse temporale, «30 giorni» nasconde il catalogo                             | §H14-bis |
| **Ordinamento**: `DataTableSort[]` è l'unica grammatica, il parametro HTTP la sua serializzazione                          | §H15     |
| **Corrispettivi**: con «Raggruppa: Giorno» niente sorting manuale, con «Nessuno» il sorting comune. I filtri sempre attivi | `10` §20 |
| **La grammatica visiva**: 12px · 4×12 · intestazione 32px MAIUSCOLA · niente divisori di colonna                           | §F6      |
| **Si conserva** il preset e le colonne visibili; **non** la larghezza né l'ordine                                          | §G1      |

## Documenti e righe — `03`, `09`, `12`

| Decisione                                                                                       | Dove          |
| ----------------------------------------------------------------------------------------------- | ------------- |
| **Una riga che movimenta ha UN movimento**, identificato da `sourceLineId`, aggiornato in posto | `09` · regole |
| **La riga è una fotografia**: un valore non modificato conserva quello persistito               | regole        |
| Lo **Scarico manuale** non crea movimenti — deroga esplicita, non un precedente                 | regole        |

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
