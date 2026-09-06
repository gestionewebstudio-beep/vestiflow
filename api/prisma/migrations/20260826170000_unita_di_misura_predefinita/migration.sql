-- Unità di misura PREDEFINITA del tenant.
--
-- PERCHÉ QUI E NON SU `tenant_feature_settings`
-- La colonna `tenant_feature_settings.default_unit_of_measure` esiste dal
-- 02/07/2026 ed è una STRINGA LIBERA che nessuno legge. È il posto sbagliato per
-- due ragioni misurate il 26/08/2026:
--
--   1. si scollega dall'elenco — si cancella «m» dalle voci e il default continua
--      a dire «m», senza che niente lo noti;
--   2. non sa dire «nessuna»: il suo default è `'pz'`, e il proprietario ha
--      deciso che l'assenza di predefinita dev'essere uno stato perfettamente
--      valido — per chi ha articoli misti e non vuole cambiarla ogni volta.
--
-- Il default è una proprietà DELL'ELENCO, non un campo accanto all'elenco. È la
-- stessa forma già in uso per Codici IVA e contatori documento.
--
-- ⚠️ La vecchia colonna NON viene toccata qui: se ne va con le altre colonne
-- morte, dopo aver sistemato il problema del ripristino da backup (gli archivi
-- già prodotti le contengono). Mescolare le due cose renderebbe questa migration
-- irreversibile per una ragione che non le appartiene.
--
-- ZERO O UNA, E IL VINCOLO STA NEL DATABASE
-- L'indice parziale è la stessa forma di `vat_codes_tenant_default_key`
-- (20260712150000): garantisce «al più una per tenant» a database, non solo
-- nell'interfaccia. Senza, due richieste in parallelo ne lasciano due.
--
-- NESSUN BACKFILL, ed è deliberato: i tenant esistenti partono SENZA predefinita
-- e la scelgono di proposito. Seminare `pz` a tutti sarebbe stato decidere al
-- posto loro proprio la cosa che si è deciso di lasciar scegliere.
--
-- COSA NON CAMBIA — e vale la pena scriverlo, perché è vero per COSTRUZIONE e
-- quindi si può perdere per costruzione:
--   · l'elenco è un insieme di SUGGERIMENTI, non l'autorità del dato;
--   · righe e articoli conservano l'unità come TESTO, e nessuna chiave esterna
--     punta a questa tabella;
--   · quindi eliminare o rinominare una voce NON riscrive articoli né documenti
--     esistenti: cambia solo cosa si potrà scegliere domani;
--   · eliminando la voce predefinita non resta semplicemente alcuna predefinita.
-- ⛔ Aggiungere qui una FK «per integrità» distruggerebbe tutto questo in una
--    riga, e sembrerebbe un miglioramento.

ALTER TABLE "unit_of_measure_options"
  ADD COLUMN "is_default" boolean NOT NULL DEFAULT false;

-- Al più una predefinita per tenant, garantita dal database.
CREATE UNIQUE INDEX "unit_of_measure_options_tenant_default_key"
  ON "unit_of_measure_options" ("tenant_id")
  WHERE "is_default" = true;
