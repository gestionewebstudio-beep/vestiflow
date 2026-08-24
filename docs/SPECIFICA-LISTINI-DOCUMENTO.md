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

⏸ **Resta da decidere una cosa sola, e va decisa prima di scrivere il codice:** che
succede a una riga il cui prezzo è stato **modificato a mano**, o **negoziato**. Oggi
verrebbe sovrascritta in silenzio come le altre — e la riga non registra da dove viene
il suo prezzo, quindi distinguerla non sarebbe possibile nemmeno volendo. Vedi §6.

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
| Scarico manuale                       | ⏸                      | oggi escluso per tipo — confermare          |
| Vendita / Reso al banco               | ➕ da mettere          | oggi cablato sul prezzo di vendita          |
| Ordine fornitore · Arrivo merce       | ⛔ no                  | sono documenti di **costo**, non di vendita |
| **Trasferimento · Rettifica**         | ⛔ **non applicabile** | vedi sotto                                  |

⛔ **Trasferimento e Rettifica non possono avere il Listino**, e non è una scelta: il
loro profilo colonne **non ha un campo prezzo**. È `articleCode · sku · barcode ·
product · variantLabel · quantity · serials · actions`. Un listino riscrive prezzi, e lì
non c'è prezzo da riscrivere — la merce si sposta o si corregge, non si vende.

### 5.1 ⭐ Il prezzo Shopify come voce dell'elenco

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

### Due cose non esistono affatto

| Serve                                   | Oggi                                                | Costo                                       |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **listino predefinito sul cliente**     | ⛔ nessun campo, né nello schema né nel client      | colonna nuova + campo in anagrafica cliente |
| **la scelta del listino sul documento** | ⛔ nessuna colonna su `documents` né `sales_orders` | colonna nuova su entrambe                   |

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

### ⏸ Le tre domande ancora aperte

**A. Le righe col prezzo modificato a mano.** Cambiando listino si riprezzano «tutte le
righe». Anche quelle il cui prezzo è stato negoziato? Oggi verrebbero sovrascritte in
silenzio, e **la riga non registra da dove viene il suo prezzo** — quindi proteggerle
richiede prima di registrarlo.

**B. Il listino ASSENTE quando un listino è scelto.** §3 decide lo **zero**. Ma se
l'articolo non ha proprio un valore per quel listino (colonna vuota): la riga vale zero
come per lo zero, oppure ripiega sul prezzo di vendita, oppure resta senza prezzo e si
segnala? Sono tre risposte diverse, e oggi le maschere ne danno quattro.

**C. Lo Scarico manuale.** È l'unico dei quattro tipi dell'Ordine cliente escluso dal
listino. Non c'è una ragione scritta: va confermato o tolto.

### E due documenti normativi da allineare

`CONTRATTO-COMUNE-DOCUMENTI` dice che il prezzo mancante vale **0,00**;
`03c-contratto-risolutore-riga` dice **campo vuoto**. Il codice fa l'uno o l'altro a
seconda della maschera. Chiusa la domanda **B**, vanno riscritti tutti e due.
