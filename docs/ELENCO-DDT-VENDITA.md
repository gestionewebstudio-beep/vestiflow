# Elenco DDT di vendita — cose da fare

_Nota di lavoro sulla schermata `/app/documents/ddt-vendita`. Aperta il 13 agosto 2026._

## Perché esiste questa nota

Non è una schermata a sé: è **l'elenco documenti col profilo `ddt-vendita`**
(`documents.routes.ts:68-74`). Ma le cose da fare su di lei non avevano un posto,
e sono finora vissute in chat — questo file è quel posto.

Se la lista resta di una voce sola, va bene: il punto è che la voce non si perda.

---

## 1. Filtro «non ancora fatturati»

_Deciso 13 agosto 2026, come conseguenza di una decisione di numerazione._

L'elenco deve poter mostrare **i soli DDT che nessuna fattura ha ancora
incluso**, filtrabili per periodo e leggibili per cliente.

### Perché conta più di quanto sembri

È la copertura scelta al posto della **generazione massiva delle fatture**
(«Genera fatture da DDT»), che è stata esclusa dal perimetro — vedi
`04-specifica-numerazione-documenti.md`, §10.

Il caso reale è la **fattura differita**: un grossista consegna alla stessa
boutique quattro volte in un mese, ogni consegna esce con un DDT, e il 31 si
fattura una volta sola. Con quindici clienti sono quindici fatture da preparare,
ognuna cercando i DDT giusti.

L'inclusione documenti — che esiste già — risolve la singola fattura: apri,
scegli il cliente, includi i suoi DDT. **Quello che non ti dà è la vista
d'insieme**: se ti dimentichi un cliente, quel cliente non compare da nessuna
parte, e i suoi DDT restano merce consegnata mai fatturata. Un ammanco che si
scopre sei mesi dopo, se si scopre.

Il valore non è la velocità, è **non dimenticare**. E quello lo dà il filtro, che
non crea niente — mentre il «genera tutte in un colpo» era la parte
tecnicamente scomoda (venti documenti nella stessa transazione, che non si
vedono l'un l'altro ai fini della numerazione).

### Il dato c'è già, e anche l'indice

Un DDT è fatturato se esiste una riga in **`InvoiceSalesDdtLink`**
(`schema.prisma:2333-2345`), che ha già l'indice `(tenantId, salesDdtId)`.

Il filtro è quindi una lettura sotto indice, **senza migration**: nessuna colonna
`invoiced` da aggiungere e da tenere allineata — il legame è la verità, e una
colonna sarebbe una seconda verità da sincronizzare.

Attenzione a un dettaglio: il legame va letto **escludendo le fatture annullate**,
o un DDT collegato a una fattura poi annullata risulterebbe fatturato e sparirebbe
dall'elenco proprio quando torna da fatturare.

### Da chiarire prima di farlo

Il proprietario ha detto che questa schermata è «**ancora da aggiustare**»: cosa
comprenda esattamente non è scritto da nessuna parte. Prima di lavorarci va
raccolto il resto — questa nota è il posto dove metterlo.
