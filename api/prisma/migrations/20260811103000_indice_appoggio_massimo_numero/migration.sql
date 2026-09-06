-- Indice di appoggio per la lettura del massimo progressivo.
--
-- La migration precedente (20260811103000-1 → 20260811090000) ha reso l'indice
-- unico un indice di ESPRESSIONE: la sua seconda chiave è `CASE(type)`, non la
-- colonna `type`. PostgreSQL aggancia un indice di espressione solo se la query
-- contiene la stessa espressione, mentre la lettura del massimo filtra sulla
-- colonna (`WHERE tenant_id = $1 AND type IN (...) AND series ...`). Quell'indice
-- ha quindi smesso di servire il `MAX(number)`, e restava solo
-- `documents_tenant_id_type_series_idx`, che il numero non ce l'ha: il massimo
-- sarebbe diventato una scansione di tutte le righe della partizione.
--
-- Non è una lettura rara: gira a ogni apertura di maschera documento, a ogni
-- salvataggio e — in cassa — DENTRO l'advisory lock, cioè nel tratto in cui le
-- casse si aspettano a vicenda. Con l'archivio che cresce, crescerebbe l'attesa.
--
-- Questo indice non impone nulla: serve solo a far tornare il massimo una
-- scansione all'indietro che si ferma alla prima riga.
CREATE INDEX IF NOT EXISTS "documents_tenant_id_type_series_number_idx"
  ON "documents" ("tenant_id", "type", "series", "number" DESC)
  WHERE "number" IS NOT NULL;
