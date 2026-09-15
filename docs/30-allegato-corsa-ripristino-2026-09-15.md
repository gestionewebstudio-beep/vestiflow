# 30 · Allegato — il sintomo `shopifyInventorySyncStates.variantId` nel ripristino (15/09/2026)

Materiale per `docs/30` §9. ⭐ **Causa MISURATA nel pomeriggio del 15/09** (sezione in fondo):
non è ambientale ed è la deriva già registrata in `docs/DA-FARE` §21-ter (09/09/2026) — la
tabella degli stati sync non ha chiavi esterne nel database — più un file di prova che non la
ripulisce alla fine. Le sezioni che seguono sono le condizioni e i log delle esecuzioni
della mattina, conservate come erano state scritte prima della misura.

## Il sintomo

Durante un'esecuzione COMPLETA della suite di integrazione (`npm run test:integration`,
PostgreSQL 5433 in Docker, `fileParallelism: false`), una prova che **esporta e ripristina**
il tenant A fallisce nel pre-controllo dei riferimenti dell'archivio:

```text
BadRequestException: Riferimento assente o di un altro negozio: shopifyInventorySyncStates.variantId.
 ❯ validateBackupReferences src/tenant/tenant-backup/tenant-backup-entities.util.ts:112:17
 ❯ TenantBackupImportService.importFromZipBuffer src/tenant/tenant-backup/tenant-backup-import.service.ts:105:5
```

Cioè: l'archivio appena esportato dal database contiene una riga di
`shopify_inventory_sync_states` (tenant A) il cui `variant_id` **non è fra le
`product_variants` esportate per il tenant A**. Il controllo è quello che distingue «assente»
da «di un altro negozio»: la riga o punta a una variante che non c'è più, o a una variante di
un altro tenant.

## Dove e quando è comparso

| Esecuzione      | Prova che fallisce                                                                                                                       | Contesto della stessa esecuzione                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1ª (mattina)    | `cassa-backup` ×3 («ripristina l'archivio reale…», «risolve gli identificativi…», «blocca restore…» che si aspettava 409 e ha avuto 400) | nello stesso giro `concorrenza-import` in **timeout** (60 s, C1–C2) per un difetto poi corretto; `divieto-ricreazione`, `storico-import-push`, `costi-varianti` rosse per mock senza il metodo nuovo |
| 4ª (pomeriggio) | `invariante-disponibile` ×6 (I10 e R1–R5, tutte export→ripristino)                                                                       | **nessun** timeout, nessun altro file rosso                                                                                                                                                          |
| 2ª, 3ª, 5ª, 6ª  | —                                                                                                                                        | verdi (la 5ª aveva altri fallimenti: «Can't reach database server at localhost:5433», «bloccata durante lo spegnimento delle protezioni», transazioni scadute — un altro sintomo)                    |

Rieseguendo **da soli** i file falliti: `cassa-backup` 22/22, `invariante-disponibile` 19/19,
e la sequenza «`protezione-scritture-inventario` → `creazione-con-identita` →
`shopify-link-rollback` → `invariante-disponibile`» (l'ordine che la cache di vitest dà a quei
quattro) 70/70. Il sintomo **non si riproduce a comando**.

## Che cosa si sa, che cosa no

- `svuota()` (fixture) fa `TRUNCATE … "tenants" RESTART IDENTITY CASCADE` con lo storico
  sbloccato: fra un file e l'altro il database è vuoto. Perché una riga di stato di inventario
  punti a una variante assente dall'export dello stesso tenant, deve essere scritta **dopo**
  che il file corrente ha riseminato il dataset — cioè da qualcosa che sopravvive al file
  precedente — oppure con `tenant_id` A e una variante di B (gli id delle sedi e dei tenant
  sono FISSI in `fixture.ts`, gli id di prodotti/varianti no).
- `shopify_inventory_sync_states` ha FK verso `product_variants`, `locations`, `tenants`
  (senza cascata dichiarata nello schema): la riga può esistere solo se la variante esiste
  **al momento della scrittura**.
- Chi scrive quella tabella: `shopify-inventory-push.service` (`updateMany`/`upsert` sugli
  stati), esercitato da `protezione-scritture-inventario`, `invio-composto`,
  `coda-ripubblicazione`, `tentativo-invio`, `origini-separate`, `esiti-comandi-massivi`,
  `collegamento-escluso`, `invariante-disponibile` stessa.
- Ipotesi principale, **non verificata**: un lavoro avviato da un file precedente (un
  ritentativo con attesa — il blocco «trasporto» ha ritentativi e una scadenza di 60 s — o un
  `void` non atteso) che scrive uno stato di inventario mentre gira il file successivo. Un
  indizio a favore: la 1ª esecuzione aveva timeout di 60 s poco prima; la 4ª no.
- Ipotesi alternativa: l'export legge le tabelle in **una transazione** (`readTenantBackupData(tx)`)
  ma senza livello di isolamento dichiarato — se una scrittura concorrente cade fra la lettura
  di `product_variants` e quella di `shopify_inventory_sync_states`, l'archivio è incoerente.
  Anche questa richiede uno scrittore concorrente.

## Come riprodurlo, quando si indaga

1. Eseguire la suite completa con un `afterAll` di diagnosi che, PRIMA di `svuota`, legga
   `SELECT s.tenant_id, s.variant_id, v.tenant_id, s.updated_at FROM shopify_inventory_sync_states s LEFT JOIN product_variants v ON v.id = s.variant_id`
   e la scriva nel log quando `v.tenant_id` è nullo o diverso (lo script
   `stati-residui` usato il 15/09 fa questa lettura: il database, letto dopo la suite, era
   vuoto — la lettura va fatta **durante**).
2. Registrare per ogni file di prova i lavori ancora pendenti alla fine (`process._getActiveHandles()`
   o un contatore nel simulatore) per vedere se qualcosa sopravvive al file.
3. Se il sintomo ricompare, il primo file da guardare è quello che ha scritto l'ultimo stato
   di inventario prima del ripristino fallito.

I log completi delle sei esecuzioni stavano nella cartella temporanea della sessione
(`integrazione.log`, `integrazione4.log`, `integrazione5.log`); gli estratti rilevanti sono
riportati sopra. Nessun dato di negozio reale: ambiente isolato, negozio simulato.

## ⭐ La causa, misurata (15/09/2026, corsa 10 con diagnosi temporanea)

**Come.** `validateBackupReferences` è stato strumentato per un giro solo (poi il file è stato
ripristinato dalla copia: `git diff` vuoto) perché scrivesse su file, al momento del rifiuto,
la riga rifiutata e le varianti esportate. In più una lettura in sola lettura di
`pg_constraint` e delle righe residue sul database di prova (5433).

**Che cosa ha catturato.** La riga rifiutata da `I10` e da `R1–R5` è **sempre la stessa**:

```text
shopify_inventory_sync_states
  id            1040e0c8-…        tenant A · sede A1
  variant_id    b8b3ffba-…        ⛔ assente da product_variants (le esportate erano INV-M / INV-L, nuove a ogni prova)
  last_pushed_available 99 · last_pushed_at = created_at − 1 h
  created_at    13:08:54.869Z     6 secondi PRIMA che invariante-disponibile iniziasse (I10 cade alle 13:09:01)
```

**Perché sopravvive.** `pg_constraint` sulla tabella:

```text
shopify_inventory_sync_states_pkey   (p)      ← l'UNICO vincolo: nessuna FK verso tenants, product_variants, locations
```

`schema.prisma` dichiara le tre relazioni; la migration che crea la tabella
(`20260713140000_shopify_inventory_sync_state`) non le scrive. Il `TRUNCATE … "tenants" …
CASCADE` di `svuota()` segue le FK, quindi **non raggiunge** la tabella: la riga resta, il
tenant A rinasce con lo stesso id fisso, la variante no. È la stessa deriva già trovata il
09/09 (`docs/DA-FARE` §21-ter) — oggi rimisurata, non scoperta.

**Chi la lascia.** La riga (tenant A, sede A1, 99, un'ora prima) è la forma esatta di
`collegamento-escluso` alla riga ~840 (sezione delle quantità). Quel file ha il contenimento
**nel `beforeEach` della sezione** (cancella gli stati prima di ogni prova) ma il suo
`afterAll` fa solo `svuota`: **la riga dell'ultima prova della sezione esce dal file**.
Tutti gli altri file che creano stati sync (`protezione-scritture-inventario`,
`tentativo-invio`, `esiti-comandi-massivi`, `origini-separate`, `invio-composto`,
`coda-ripubblicazione`, `invariante-disponibile`) li cancellano anche nell'`afterAll`.

**Perché a intermittenza.** Dipende da quale file segue `collegamento-escluso` nell'ordine
che vitest ricava dalla cache delle durate: se è uno che esporta il tenant A senza prima
ripulire gli stati (`invariante-disponibile`, `cassa-backup`, `ripristino-storico-shopify`),
il rifiuto compare; se è `coda-ripubblicazione` o un altro che cancella la tabella nei propri
hook, la riga sparisce e il giro è verde. Le corse 8 e 10 avevano l'ordine sfavorevole, le
altre no. Non c'entrano tempi, ritentativi né lavori pendenti: le due ipotesi della mattina
sono ritirate.

**Che cosa NON è stato fatto, e perché.**

| Rimedio                                                                                                                          | Stato                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| correzione vera: migration che aggiunge le tre FK (decidere `ON DELETE`, contare e pulire gli orfani già presenti sul condiviso) | ⛔ **non fatta**: schema a storia condivisa, cambia il comportamento delle cancellazioni, è la voce aperta di `DA-FARE` §21-ter — decisione del proprietario                                                                                                                           |
| contenimento: `deleteMany({})` degli stati sync nell'`afterAll` di `collegamento-escluso`, come già negli altri sette file       | ✅ **fatto** (15/09 sera, commit separato, via del proprietario): cancellazione limitata ai tenant della fixture, pulizia che solleva i propri errori. Sequenza verificata: prima 1 riga residua e 6 rosse in `invariante-disponibile`; dopo 0 righe e 19/19; suite completa 1018/1018 |
| per ottenere un giro pulito oggi: `TRUNCATE` della sola tabella sul database di prova 5433 prima della corsa finale              | ✅ fatto (la tabella era già vuota: 0 righe)                                                                                                                                                                                                                                           |
