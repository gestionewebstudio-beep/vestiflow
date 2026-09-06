-- ⭐ L'ORDINE FORNITORE SOPRAVVIVE AL FORNITORE — deciso dal proprietario il
--    30/08/2026, ed è la stessa regola dell'unità di misura e del Codice IVA:
--
--      «quando cancello un'u.m., il dato nei documenti diventa testo e non
--       sparisce. Tutto quello che è salvato nel gestionale resta, sparisce solo
--       la scheda.»
--
-- ⛔ PERCHÉ SERVE UNA MIGRATION, e per i clienti no.
--
--    Sui clienti tutti e tre i riferimenti erano già facoltativi: bastava
--    sganciarli in transazione. Qui `supplier_orders.supplier_id` è NOT NULL,
--    quindi il database RIFIUTEREBBE l'eliminazione — e le due alternative erano
--    peggiori: cancellare gli ordini (sono documenti, non si toccano) o vietare
--    l'eliminazione a chi ha ordini (cioè a chiunque abbia lavorato con lui).
--
-- ⭐ IL NOME NON SI PERDE: `supplier_name` è uno snapshot, scritto alla creazione
--    con `partyDisplayName(supplier.party)`. L'elenco lo usa già per la ricerca —
--    il riferimento serve ad aprire la scheda, non a leggere il nome.
--
-- ⚠️ ADDITIVA E REVERSIBILE: nessuna riga cambia, nessun dato si perde. Un ordine
--    esistente continua a puntare al suo fornitore; cambia solo che la colonna
--    ACCETTA il vuoto per quelli il cui fornitore verrà eliminato.
--
-- ⚠️ SCRITTA A MANO, come impone `regole-qualita`: su questo database condiviso
--    `prisma migrate diff` propone di cancellare le tabelle degli altri rami.

ALTER TABLE "supplier_orders" ALTER COLUMN "supplier_id" DROP NOT NULL;

-- ⛔ E la relazione passa a ON DELETE SET NULL, che è la METÀ MANCANTE.
--
--    Senza, il vincolo resta `NO ACTION`: la colonna accetterebbe il vuoto ma il
--    database continuerebbe a rifiutare l'eliminazione del fornitore. Le due
--    dichiarazioni vanno insieme — una sola delle due non fa niente di utile.
--
-- ⚠️ Il nome del vincolo è quello che Prisma genera per convenzione
--    (`<tabella>_<colonna>_fkey`): si ricrea con lo stesso nome, o la prossima
--    migration generata non lo riconoscerebbe.
ALTER TABLE "supplier_orders" DROP CONSTRAINT "supplier_orders_supplier_id_fkey";

ALTER TABLE "supplier_orders"
  ADD CONSTRAINT "supplier_orders_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
