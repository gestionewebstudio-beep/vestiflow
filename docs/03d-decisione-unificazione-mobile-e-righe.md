# 03d · Decisione definitiva — unificazione righe e mobile documenti

**Stato:** decisione del proprietario, **in vigore**
**Data:** 24/08/2026
**Famiglia:** `03` normativa · `03b` mappa tecnica · `03c` contratto del risolutore · **`03d` questa decisione**

> **Cambia il criterio operativo.** Fino a qui ogni divergenza trovata nel codice veniva
> valutata come possibile eccezione da promuovere a policy. Da adesso no: **prima si
> converge sulla struttura comune, le differenze si rifiniscono alla fine**, e si
> esprimono come configurazione — mai come una seconda implementazione.
>
> Integra `03`, che già prescrive un solo sistema comune di riga con row, header,
> quick-row e card comuni e differenze fornite dall'esterno.

---

## 1 · L'Ordine cliente è il riferimento mobile

Per tutti i documenti VestiFlow con **vere righe articolo**, la struttura mobile converge
su quella dell'Ordine cliente, assunta come riferimento concreto già validato.

⛔ **Non si vogliono più**: una card Arrivo merce, una card Ordine fornitore, una card
Banco, una card Trasferimento, una card Documenti vendita — ciascuna costruita per conto
suo. **Una sola struttura mobile comune**, riusata dai documenti.

---

## 2 · Prima la convergenza strutturale, poi le differenze

⛔ **Non fermarsi prima della convergenza** per chiedere «questo campo serve davvero in
questo documento?».

Si costruisce prima un **superset comune di capability** che sappia rappresentare tutte le
vere righe articolo. Poi, nel collaudo documento per documento, si decide cosa è visibile,
cosa editabile, cosa in sola lettura, cosa non appartiene, quali azioni si abilitano.

> **Prima si rende unica la struttura; poi si rifinisce la configurazione.**

⚠️ Questo **non** significa scrivere campi senza significato nel database: significa che il
componente comune sa rappresentarli, e il consumer decide se usarli.

---

## 3 · Una sola grammatica mobile

La struttura comune deve coprire almeno le capability realmente esistenti nelle righe
prodotto:

nome prodotto · variante · SKU e codici · U.M. · quantità · prezzo · costo · sconto · IVA ·
eventuale effetto stock · lotto · scadenza · valori in sola lettura o derivati · azioni riga ·
espansione della card · ricerca e inserimento · scansione · navigazione e fuoco pertinenti
al mobile.

⛔ **Non si creano componenti diversi perché un documento ne usa solo una parte.** La
struttura comune riceve configurazione e capability.

---

## 4 · Stessa struttura NON significa stesso dominio

Restano semanticamente distinti **Impegna**, **Carica** e **Scarica**. Possono usare la
stessa primitiva visuale e la stessa regola comune sull'eleggibilità dell'articolo, ma
**campo persistito, default, effetto sul backend e significato gestionale restano
distinti** — `03` lo stabilisce: _stessa cella visuale non significa stesso campo backend_.

Allo stesso modo: costo ≠ prezzo · IVA acquisto ≠ IVA vendita · prezzo anagrafico ≠ prezzo
di riga · `Product` ≠ `ProductVariant`.

⛔ **La UI comune non deve fondere questi concetti.**

---

## 5 · L'Arrivo merce resta speciale solo dove è davvero speciale

Usa la **stessa** infrastruttura di riga e mobile degli altri. Restano proprie del suo
dominio: la creazione esplicita di un articolo nuovo · la gestione del costo · la
visualizzazione e modifica dei prezzi anagrafici previsti · l'eventuale aggiornamento di
`Product`/`ProductVariant` secondo le sue spunte · Carica magazzino · lotto e scadenza dove
pertinenti.

```text
anagrafica  →  resolver  →  valori iniziali della riga        sempre
riga        →  Product / ProductVariant                        SOLO Arrivo merce,
                                                               e solo se autorizzato
```

Il confine è già registrato in `03c`: **il resolver non scrive mai nell'anagrafica.**

---

## 6 · `variantLabel` e descrizione diventano comuni

```text
variantId                          identità tecnica
nomeProdotto / description / title testo del prodotto sulla riga
variantLabel                       la variante, separata e fotografata
```

⛔ **Nessun documento deve più persistere «Nome prodotto — Variante» dentro la
descrizione** per sopperire alla mancanza della variante separata.

Il componente comune mostra `variantLabel` **allo stesso modo per tutti**: nessun renderer
specifico per Banco, Trasferimento, Ordine cliente.

---

## 7 · Il Banco non è una struttura mobile diversa

Vendita e Reso al banco usano la stessa struttura comune derivata dall'Ordine cliente.

Le differenze del Banco sono **policy operative reali** — scansione ripetuta dello stesso
EAN, eventuale deduplica o incremento, Vendita come uscita e Reso come rientro — e stanno
**sopra** la struttura comune. ⛔ Non devono produrre una seconda card né una seconda
implementazione dei campi.

---

## 8 · Il resolver comune resta il punto unico

Risponde a una domanda sola: _«ho scelto questa variante: quali valori iniziali
appartengono alla riga?»_.

⛔ **Non decide**: dove atterra l'articolo · se incrementare una riga esistente · la
quantità che deriva dall'acquisizione · il fuoco · `emitEvent` · la persistenza · gli
effetti sul backend.

Produce **gli stessi dati base per tutti i consumer**, salvo vere policy di dominio. `03c`
ha già rifiutato come policy undici divergenze storiche prive di ragione funzionale.

---

## 9 · Anche il desktop converge

Una `document-line-row` · un `document-line-head` · una famiglia comune di celle · un
`money-input` · la stessa infrastruttura di ricerca, fuoco e scanner · configurazioni e
capability del documento.

⚠️ **Non copiare graficamente l'Ordine cliente sul desktop** se esiste già il contratto
comune desktop: mobile prende l'Ordine cliente come riferimento concreto, desktop converge
sulla riga e tabella comuni.

---

## 10 · I comportamenti locali sbagliati non si preservano

⛔ **Il codice corrente non è fonte del requisito.** Sono errori da eliminare, non
comportamenti da mantenere:

- nome prodotto duplicato;
- variante impastata nella descrizione;
- variante storica ricostruita dal catalogo corrente;
- ripieghi diversi senza ragione;
- U.M. `'pz'` cablata;
- resolver locali equivalenti;
- campi comuni inizializzati diversamente solo perché i form sono nati separati.

Le decisioni recenti **prevalgono** sul codice osservato: lo stabilisce anche il Blocco 0.

---

## 11 · Metodo di migrazione

Un commit per consumer, perché serve a regressioni e ritorno indietro. Ma quando si tocca
una maschera:

> **la si migra in una sola volta per tutte le responsabilità comuni già coperte dal
> contratto.**

⛔ Non si vuole: commit variante, poi commit U.M., poi commit nome, poi commit IVA, poi
commit money — sulla stessa funzione. **Una maschera entra nel sistema comune una volta.**

Lo stato può restare _«implementata, test verdi, collaudo visuale pendente»_: ⛔ **non ci si
ferma dopo ogni maschera** aspettando il collaudo, salvo rischio funzionale reale.

---

## 12 · Le differenze si gestiscono alla fine

Dopo la convergenza strutturale, il collaudo completo. Solo allora si rifiniscono:
visibilità delle capability · ordine dei campi · sola lettura o editabile · testi ed
etichette · spunte applicabili · differenze vendita/acquisto · sezioni specifiche ·
dettagli responsive · eccezioni realmente necessarie.

> L'obiettivo è che queste modifiche avvengano **sulla configurazione del sistema comune**,
> non tornando a modificare sette template diversi.

---

## 13 · Cosa NON va unificato in questa famiglia

⛔ Non forzare dentro la riga prodotto strutture di dominio differenti. Le vere **righe
finanziarie e di pagamento** hanno una famiglia comune propria, pur riusando primitive
generiche — money, date, select, input, checkbox.

⛔ E **non si inventa adesso il contratto Seriali**: il Blocco 0 lo lascia espressamente
aperto.

---

## 14 · La regola di successo

Il lavoro è riuscito quando si può dire:

```text
mobile                  →  una sola struttura comune, riferimento Ordine cliente
desktop                 →  una sola struttura comune di riga e tabella
articolo entra in riga  →  un solo resolver
celle                   →  una sola famiglia comune
ricerca e scanner       →  un solo motore, con policy di acquisizione
```

e le differenze dei documenti sono **soltanto configurazioni e policy reali**.

⛔ Nessun componente comune deve contenere una cascata di `if (documentType === …)`.

---

## 15 · La verifica finale

Dopo la convergenza, un censimento finale:

```text
maschera → mobile comune → desktop comune → resolver → money → U.M. → IVA →
variante → ricerca/scanner → capability specifiche → test → collaudo visuale
```

più l'elenco di ciò che resta:

- card specifiche residue;
- `<tr>` locali residui;
- resolver locali residui;
- concatenazioni nome/variante residue;
- scanner locali residui;
- campi comuni ancora implementati localmente;
- `if (documentType)` nei componenti condivisi;
- differenze rimaste, **con la loro motivazione funzionale**.

⛔ **Non considerare concluso il consolidamento perché compila.** Il collaudo manuale di
tutte le maschere lo fa il proprietario alla fine.

Commit locali e reversibili. Nessun push.
