# Ordine fornitore — la riga e la colonna del costo

_Consegna del 07/08/2026. Chi riprende parte da qui: non serve altro contesto._

## A cosa serve l'Ordine fornitore

È il documento con cui si **ordina merce al fornitore**. Eventualmente si porta in
**Arrivo merce** per caricarla.

**Non muove giacenze né disponibilità** — verificato: nessun percorso dell'Ordine
fornitore scrive movimenti, e il costo di riga non alimenta né il costo effettivo della
variante, né l'ultimo prezzo fornitore, né i margini. Quelli si alimentano tutti dalla
riga dell'**Arrivo merce**.

---

## Le tre regole da realizzare

### 1. La riga come quella dell'Ordine cliente

Deve avere **ricerca articolo, inserimento e creazione di un articolo nuovo al volo**,
come l'Ordine cliente. Si prende **tutto** quello che ha l'Ordine cliente e poi si decide
cosa nascondere dal tasto **Colonne** — invece di decidere in anticipo cosa togliere.

### 2. La regola di sovrascrittura

> Se scrivo qualcosa in una **riga vuota** e poi **richiamo un articolo**, i dati
> dell'articolo **sovrascrivono** quello che avevo scritto.

Il richiamo dell'articolo è la fonte: quello che c'era prima era una bozza.

### 3. La colonna del costo — netto/ivato che **non perde mai**

Il giro deve tornare **sempre**: digito un costo ivato, passo a netto, torno a ivato →
rivedo lo **stesso** costo ivato. Se ordino direttamente in netto, il problema non si pone.

**Il costo nella riga è solo informazione**: non modifica il prezzo dell'articolo in
anagrafica. **Unica eccezione**: se da lì si **crea un articolo nuovo**, quel valore
_diventa_ il prezzo dell'articolo.

---

## ⚠️ Come NON farlo — e questa è la parte che conta

**Non copiare il selettore del DDT vendita.** Sembra il modello giusto ed è la richiesta
iniziale, ma ha il difetto che si vuole evitare.

Il DDT vendita converte il **valore mostrato** (arrotondato a due decimali) con
`grossFromNetMinor` / `netFromGrossMinor`. Misurato su 4.901 prezzi da 1,00 a 50,00 al 22%:

| Punto di partenza                                        | Giri che non tornano     |
| -------------------------------------------------------- | ------------------------ |
| **netto** (articolo richiamato): netto → ivato → netto   | **0 su 4901**            |
| **lordo** (costo digitato a mano): ivato → netto → ivato | **884 su 4901 — il 18%** |

```
netto 4,11  →  ivato 5,01  →  netto 4,11   ✓ stabile
lordo 5,02  →  netto 4,11  →  ivato 5,01   ✗ il 5,02 viene assorbito
```

**Perché conta qui:** sull'Ordine fornitore il costo si **digita**. Si richiama
l'articolo, arriva il costo d'anagrafica, e poi l'operatore lo **cambia** — perché propone
un costo nuovo al fornitore o perché lo paga di più. Quello è un lordo digitato: il caso
che perde. Non è un caso limite, è la norma.

_(Nota: lo stesso difetto è presente nel DDT vendita e nell'Ordine cliente per i prezzi
digitati a mano. Fuori ambito qui, ma da sapere.)_

## ✅ Come farlo — il modello è la scheda articolo

La **sezione Listini della scheda articolo**
(`src/app/domain/products/components/product-general-step/product-general-step.component.ts`)
fa la cosa giusta e va imitata:

- tiene il **netto canonico in memoria** (signal `netPrices`), con la coda decimale
- il campo è **solo una vista**: `toDisplayed` rende, `toNet` memorizza
- il toggle cambia **solo la vista** (`showNetPrices`, con `emitEvent: false`) — non
  ricalcola mai il canonico dal valore mostrato
- in memorizzazione usa lo scorporo **esatto** (`netFromGrossExact` + `toStorableMinor`),
  in visualizzazione quello **arrotondato** (`grossFromNetMinor`)

Passando avanti e indietro quante volte si vuole, il numero non si muove — perché non
viene mai ricostruito da ciò che si vede.

---

## Precondizione: la colonna deve poter conservare la coda

`SupplierOrderLine.unitCostMinor` e `enteredUnitCostMinor` sono oggi **`Int`**
(`schema.prisma:1045,1047`). Senza decimali il giro torna finché si resta nella schermata
e **si rompe appena si salva e si riapre**.

Vanno portate a **`Decimal(16,6)`**, come `DocumentLine.unitPriceMinor`. Serve anche
`toStorableMinor` **lato server** (oggi esiste solo nel frontend,
`src/app/core/utils/money.util.ts:72`): va in `api/src/common/money.util.ts`, dove sta il
resto della dottrina del denaro.

**Questo lavoro è già stato fatto una volta e poi annullato**, perché era stato consegnato
senza spiegare a cosa servisse e sembrava inutile. Rifarlo costa poco ed è **misurato**:

| Area                | Punti                                                 |
| ------------------- | ----------------------------------------------------- |
| Schema e migrazione | 2 colonne, **un solo** `ALTER TABLE`                  |
| Backend             | 3 (typecheck ne segnalò esattamente 3, tutti nel PDF) |
| Frontend            | il mapper `supplier-order-api.mapper.ts`              |
| Consumatori a valle | **0** — verificato porta per porta                    |

Due trappole già incontrate, per non ripagarle:

- **Nel mapper, la conversione `Number()` va DOPO il ripiego**, non prima:
  `Number(row.enteredUnitCostMinor ?? row.unitCostMinor)`. Convertire prima farebbe
  diventare **zero** un costo assente, perché `Number(null)` vale 0 e `0 ?? x` resta 0.
- **Il motore IVA condiviso non si tocca**: lo usano anche Arrivo merce e Vendita al
  banco, e cambiarlo sposterebbe in silenzio ogni documento già registrato. Si chiama
  `netFromGrossExact`, che **esiste già** nello stesso file — non si scrive una formula
  nuova.

---

## Il test che dichiara la regola

> Un costo digitato in modalità ivata, salvato e riletto, **torna identico** — su un
> elenco di casi, non sul solo 5,02.

Deve essere **rosso prima** della correzione. Se nasce verde, la diagnosi è sbagliata:
fermarsi e capire perché. _(È già successo: un test nato rosso per un difetto della
finzione di prova, non per il difetto vero.)_

---

## Fuori ambito

- L'**Arrivo merce** e il **motore IVA condiviso**, che hanno lo stesso difetto: da
  misurare a parte quando si affrontano gli acquisti.
- Il **DDT vendita** e l'**Ordine cliente**, che perdono il centesimo sui prezzi digitati
  a mano per lo stesso motivo.
