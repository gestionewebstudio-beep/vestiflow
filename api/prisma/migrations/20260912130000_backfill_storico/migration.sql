-- PlatformAuditOperation: la conversione delle colonne-cache in storico.
--
-- ⭐ PERCHE'. Il backfill (docs/24 §8.5.8, fasi 3-4) scrive identita' e periodi
--    per collegamenti fatti PRIMA dello storico. docs/DA-FARE §14, punto 5, chiede
--    a ogni script di backfill «una riga di registro di cio' che ha scritto, con
--    la stessa forma di §10.3»: tentativo prima, riuscita dentro la transazione,
--    con i conteggi in `reason`. L'attore `backfill` esiste gia' nell'enum.
--
-- ⚠️ Una sola riga per tenant e per esecuzione che scrive davvero: un'esecuzione
--    senza niente da convertire non lascia traccia (idempotenza prima del
--    tentativo), e un tenant bloccato dai controlli non arriva alla scrittura.
--
-- ⛔ NON applicata al database CONDIVISO.

ALTER TYPE "PlatformAuditOperation" ADD VALUE IF NOT EXISTS 'backfill_storico';
