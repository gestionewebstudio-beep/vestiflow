-- PlatformAuditOperation: i due rifiuti dell'import da Shopify.
--
-- ⭐ PERCHE'. B5-B6 (docs/24 §11.8) vieta di ricreare un articolo eliminato
--    definitivamente, di duplicarne uno gia' collegato e di riaprire da soli un
--    collegamento chiuso. Il rifiuto e' un fatto operativo — l'articolo che il
--    negozio manda e VestiFlow non prende — e fino al 09/09/2026 ne restava
--    traccia solo in un `logger.warn` sul container, che il riavvio perde.
--    docs/DA-FARE §10.3 esclude espressamente il solo log tecnico: «un rifiuto
--    invisibile e' indistinguibile da un articolo che non e' mai arrivato».
--
-- ⚠️ Due valori e non uno, per coerenza con l'enum che gia' distingue prodotto
--    e variante (cestino_prodotto / cestino_variante): il rifiuto della variante
--    e' PER VARIANTE, e il prodotto intorno si aggiorna come sempre.
--
-- ⚠️ La riga e' UNA, con esito `rifiutata`, senza il `tentativo` che la
--    sequenza canonica premette alle operazioni: qui non c'e' un'operazione in
--    volo da correlare — la valutazione e' gia' conclusa, e il suo esito e' la
--    decisione stessa. Il CHECK `platform_audit_logs_negativo_motivato` esige il
--    motivo, e il motivo c'e': la regola che ha deciso, per nome.
--
-- ⚠️ Aggiunta DOPO che la migration del registro era gia' applicata al database
--    di prova: si aggiungono valori, non si riscrive il tipo. Da PostgreSQL 12
--    `ADD VALUE` gira in transazione; qui e' 17.
--
-- ⛔ NON applicata al database CONDIVISO.

ALTER TYPE "PlatformAuditOperation" ADD VALUE IF NOT EXISTS 'import_prodotto_rifiutato';
ALTER TYPE "PlatformAuditOperation" ADD VALUE IF NOT EXISTS 'import_variante_rifiutata';
