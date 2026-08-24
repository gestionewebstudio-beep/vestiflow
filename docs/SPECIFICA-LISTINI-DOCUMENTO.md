# Specifica — il Listino sui documenti

> **Cos'è.** Le regole del **Listino applicato alle righe**: chi lo propone, cosa
> succede scegliendolo, come si comporta un prezzo a zero, e cosa resta salvato.
>
> **Stato.** Decisioni del proprietario del **24/08/2026**. Il codice **non le
> implementa ancora**: questo documento è il contratto verso cui portarlo, e la §6
> misura la distanza.
>
> **Rapporto con le altre specifiche.** `03` governa le righe, `03c` il risolutore,
> `CONTRATTO-COMUNE-DOCUMENTI` il denaro. Dove questo documento e quelli divergono, va
> allineato **quello vecchio**: qui c'è la decisione più recente. Due punti di
> contrasto già noti sono elencati in §6.

---

## 1. Il Listino del cliente è un valore PROPOSTO, non imposto

| Il cliente scelto…                | Il campo Listino in testata | Le righe nuove prendono   |
| --------------------------------- | --------------------------- | ------------------------- |
| **ha** un listino predefinito     | si precompila con quello    | il prezzo di quel listino |
| **non ha** un listino predefinito | resta **vuoto**             | il **prezzo di vendita**  |

⛔ **Vuoto non è zero, e non è «Listino 1».** Vuoto significa **nessun listino
speciale applicato**, e la riga prende il prezzo di vendita dell'articolo — che è il
comportamento di sempre.

⭐ **Proposto, quindi modificabile.** Scegliere il cliente riempie il campo; l'operatore
può cambiarlo, e da quel momento comanda la sua scelta. Cambiare cliente ripropone il
listino del nuovo cliente.

---

## 2. Scegliere un listino

```text
Cliente: Rossi          Listino: [vuoto]

Articolo A    prezzo di vendita 25,00    Listino Ingrosso 18,00

  aggiungo l'articolo, nessun listino scelto   →   prezzo riga  25,00
  scelgo «Ingrosso»                            →   prezzo riga  18,00
```

**Cambiando listino, le righe già presenti si riprezzano tutte** con i nuovi valori
proposti.

### ✅ Tutte vuol dire TUTTE — deciso il 24/08/2026

> **Anche le righe il cui prezzo è stato modificato a mano o negoziato prendono il nuovo
> prezzo. Nessuna riga è esente, nessuna eccezione da riconoscere.**

⭐ **È la regola più semplice che esista, ed è il suo pregio.** Cambiare listino significa
«questo documento si fa a quelle condizioni», e un documento a condizioni miste non è quello
che l'operatore ha chiesto. La regola alternativa — proteggere le righe toccate a mano —
richiederebbe alla riga di ricordare **da dove viene** il proprio prezzo, cioè un dato in più
da mantenere, da salvare e da tenere giusto per sempre. Non esiste oggi, e questa decisione
evita di doverlo introdurre.

⚠️ **Il costo, e va detto perché ricadrà sull'operatore.** Chi ha trattato un prezzo riga per
riga e poi cambia listino **perde la trattativa**, e la perde in silenzio. Da qui discende un
requisito che non è un abbellimento: **il cambio di listino su un documento che ha già righe
si annuncia prima di applicarlo**, dicendo quante righe verranno riprezzate, con la
possibilità di rinunciare. È un'azione sensibile nel senso di `regole-gestionale` — riscrive
in blocco valori economici già inseriti — e le azioni sensibili chiedono conferma.

---

## 3. Un listino che vale ZERO

> **UI: campo vuoto. Valore economico: zero. Nessun ripiego sul prezzo di vendita.**

```text
LISTINO SCELTO
      ↓
prezzo di listino = 0
      ↓
a video: campo VUOTO          ← scelta di rappresentazione
      ↓
valore economico: 0           ← non null, non il prezzo normale
      ↓
Salva → il documento conserva 0, i totali si calcolano con 0
```

⛔ **Il ripiego sul prezzo di vendita NON scatta quando un listino è stato scelto.**
Scatta solo nel caso di §1: **nessun listino selezionato**.

⚠️ **Perché il campo si mostra vuoto e non «0,00».** Sono due letture diverse per
l'operatore: «0,00» sembra un prezzo deciso, il vuoto sembra un prezzo da mettere. Qui
il prezzo È deciso e vale zero — ma mostrarlo come 0,00 in mezzo a righe da 18 e 25
euro fa sembrare la riga un errore di battitura. Il vuoto dice «questo articolo, in
questo listino, non si fa pagare».

⏸ **Il caso GEMELLO non è deciso**, e va deciso insieme: cosa succede quando l'articolo
**non ha affatto** un valore per il listino scelto — la colonna è vuota, non zero. Vedi
§6.

---

## 4. Quello che accade nel documento resta salvato

> **Riaprendo un documento, lo si ritrova nello stesso stato economico e commerciale in
> cui è stato salvato.**

Cliente · listino scelto · prezzi risultanti · prezzi modificati a mano · sconti · IVA ·
quantità · agente · gli altri valori di testata: tutto torna com'era.

```text
salvato:      Cliente Rossi · Listino Ingrosso · prezzo riga 18,00
riaperto:     Cliente Rossi · Listino Ingrosso · prezzo riga 18,00

⛔ NON:       Cliente Rossi · Listino [vuoto]  · prezzo riga 18,00
```

⭐ **Il prezzo di riga resta comunque una fotografia.** Se domani il Listino Ingrosso
dell'articolo passa da 18 a 20 euro, il documento già salvato resta a 18. La non
retroattività dei prezzi sui documenti esistenti è già regola del progetto
(`regole-gestionale`, «La riga di un documento è una fotografia»).

⚠️ **Le due cose non si contraddicono**: si conserva **quale listino** è stato usato —
che è un fatto del documento — e **quanto è costato** — che è la fotografia. Oggi si
conserva solo il secondo, e riaprendo la tendina dice sempre «Prezzo di vendita».

---

## 5. Il perimetro

**Il selettore va su tutti i documenti di vendita e di ordine.** Oggi lo hanno due
maschere su otto, e su una delle due solo nella vista mobile.

| Documento                             | Listino                | Nota                                        |
| ------------------------------------- | ---------------------- | ------------------------------------------- |
| Proforma · Fattura · Fatt. accompagn. | ✅ c'è                 | l'unico già su entrambe le viste            |
| Ordine cliente · Preventivo · DDT     | ⚠️ solo mobile         | da portare su scrivania                     |
| Scarico manuale                       | ✅ **sì**              | deciso il 24/08 — vedi §5.1                 |
| Vendita / Reso al banco               | ➕ da mettere          | oggi cablato sul prezzo di vendita          |
| Ordine fornitore · Arrivo merce       | ⛔ no                  | sono documenti di **costo**, non di vendita |
| **Trasferimento · Rettifica**         | ⛔ **non applicabile** | vedi sotto                                  |

⛔ **Trasferimento e Rettifica non possono avere il Listino**, e non è una scelta: il
loro profilo colonne **non ha un campo prezzo**. È `articleCode · sku · barcode ·
product · variantLabel · quantity · serials · actions`. Un listino riscrive prezzi, e lì
non c'è prezzo da riscrivere — la merce si sposta o si corregge, non si vende.

### 5.1 ✅ Lo Scarico manuale è dentro — deciso il 24/08/2026

Qui era l'unico ⏸ del perimetro. **Rientra in tutto quello che dice questa specifica**, come
gli altri tre tipi della sua maschera: selettore in testata, listino proposto dal cliente,
riprezzamento delle righe, zero mostrato vuoto, scelta conservata al salvataggio.

⚠️ **Quello che lo distingue non c'entra col listino.** Lo Scarico manuale **agisce
direttamente sulle giacenze e non crea `StockMovement`**: il documento è l'unica evidenza
dello scarico, e cancellarlo non ripristina la giacenza. È la deroga già scritta in
`regole-gestionale`, decisa dal cliente, e riguarda il **magazzino** — non i prezzi.

⛔ **Le due cose non vanno confuse.** Un tipo che non lascia traccia a magazzino non è per
questo un tipo senza economia: le sue righe hanno prezzi come le altre, e un listino le
riprezza come le altre. Escluderlo dal listino perché «è speciale» sarebbe applicare una
deroga fuori dal suo perimetro.

### 5.2 ⭐ Il prezzo Shopify come voce dell'elenco

**Idea del proprietario, 24/08/2026: aggiungere il prezzo Shopify come voce del
selettore**, così per compilare un documento coi prezzi del canale online basta
sceglierlo in testata.

Regge, e costa poco: il valore esiste già (`products.shopify_price_minor`), è un prezzo
di vendita unitario con la stessa semantica degli altri, e lo schema stesso lo chiama
«listino».

⚠️ **Con un vincolo, e va scritto**: è una **sorgente**, non una destinazione.
Sceglierlo riempie i prezzi delle righe; **non scrive nulla verso Shopify**, e non
cambia il prezzo del canale. Valgono le stesse regole di §3 per lo zero e per l'assente.

---

## 6. La distanza dal codice di oggi — misurata il 24/08/2026

### Due cose non esistono affatto — e vanno entrambe fatte

Confermate dal proprietario il 24/08: il listino predefinito **va inserito in anagrafica
cliente**, per potergli assegnare un listino diverso dal prezzo base.

| Serve                                   | Oggi                                                | Da fare                                     |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **listino predefinito sul cliente**     | ⛔ nessun campo, né nello schema né nel client      | colonna nuova + campo in anagrafica cliente |
| **la scelta del listino sul documento** | ⛔ nessuna colonna su `documents` né `sales_orders` | colonna nuova su entrambe                   |

⭐ **La colonna del cliente memorizza una SCELTA, non un prezzo**, e la distinzione conta: è
il nome del listino da proporre, non un valore in denaro. Cambiare domani il prezzo di quel
listino non tocca il cliente, e non tocca i documenti già emessi.

⚠️ **Sono due migration su un database CONDIVISO col collega.** Valgono le regole di
`regole-qualita`: SQL scritto a mano, `npm run prisma:deploy`, mai `migrate dev`. E
schema, migration e deploy si fanno **insieme o per niente**: rigenerare il client con
una colonna che nel database non c'è manda in errore ogni lettura di quella tabella.

### Sette difetti già presenti, che questa specifica chiude o rende decidibili

| #   | Difetto                                                                 | Lo chiude       |
| --- | ----------------------------------------------------------------------- | --------------- |
| 1   | il Listino non esiste su scrivania per Ordine cliente, Preventivo, DDT  | §5              |
| 2   | una riga entra a 0,00 in silenzio aggiungendola dopo aver scelto        | §3 (+ avviso)   |
| 3   | la stessa condizione dà **quattro** esiti diversi fra le maschere       | §3              |
| 4   | una riga resta fuori dal riprezzamento senza comparire in nessun avviso | §2 (da coprire) |
| 5   | sull'Ordine cliente i totali restano fermi dopo il cambio listino       | difetto a sé    |
| 6   | zero e assente indistinguibili sul documento                            | §3 per lo zero  |
| 7   | la coda decimale si perde al primo passaggio nel campo                  | difetto a sé    |

### ⏸ Le domande aperte — due chiuse il 24/08, una resta

✅ **A — chiusa.** «Tutte le righe» vuol dire tutte, comprese quelle trattate a mano. Vedi
§2. Ne discende il requisito della conferma prima di riprezzare.

✅ **C — chiusa.** Lo Scarico manuale è dentro il perimetro. Vedi §5.1.

⏸ **B — resta aperta, ed è l'ultima.** **Il listino ASSENTE quando un listino è scelto.**
§3 decide lo **zero**: campo vuoto a video, zero nell'economia, nessun ripiego. Ma se
l'articolo non ha proprio un valore per quel listino — la colonna è `null`, non `0` — le
risposte possibili sono tre, e non sono equivalenti:

| Risposta                                | Cosa dice all'operatore                                      | Rischio                                                           |
| --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| **vale zero**, come lo zero esplicito   | «in questo listino l'articolo non si fa pagare»              | regala merce per una colonna mai compilata                        |
| **ripiega** sul prezzo di vendita       | «per questo articolo il listino non c'è, uso quello normale» | un documento a condizioni miste senza che si veda                 |
| **resta senza prezzo** e si **segnala** | «questo articolo in questo listino non è previsto: decidi»   | costringe a intervenire riga per riga, ma nessun valore inventato |

⚠️ **Vale la pena decidere questa insieme allo zero, non dopo**, perché oggi zero e assente
sono indistinguibili sul documento salvato (difetto 6 qui sopra): finché lo restano, qualunque
regola si scriva non è verificabile a posteriori.

⭐ **La terza è quella che non inventa niente**, ed è coerente con la scelta già fatta al §3
di non far scattare ripieghi quando un listino è stato scelto — ma costa un intervento
all'operatore, e questa è la parte da soppesare.

### E due documenti normativi da allineare

`CONTRATTO-COMUNE-DOCUMENTI` dice che il prezzo mancante vale **0,00**;
`03c-contratto-risolutore-riga` dice **campo vuoto**. Il codice fa l'uno o l'altro a
seconda della maschera. Chiusa la domanda **B**, vanno riscritti tutti e due.
