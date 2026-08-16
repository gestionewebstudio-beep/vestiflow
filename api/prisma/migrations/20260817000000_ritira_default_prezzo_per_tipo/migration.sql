-- Ritira i due livelli netto/ivato sostituiti dalla convenzione aziendale.
--
-- Il codice che li usava è già sparito (migration 20260816210000 e il commit che
-- la accompagna). Questa toglie le strutture: è la seconda metà di quel lavoro,
-- fatta a parte perché una DROP non si mescola a un cambio di comportamento.
--
-- ── 1 · document_type_settings.prices_include_vat ──────────────────────────
-- Era un default netto/ivato per TIPO documento (tenant × tipo). Nessun pannello
-- lo esponeva, quindi nessuno l'ha mai potuto impostare: UNA riga in tutto il
-- database, per supplier_order, con `true` — e tutti e diciotto gli ordini
-- fornitore che avrebbe dovuto governare sono netti. Non ha mai deciso niente,
-- perché la maschera manda sempre un valore e il ripiego `??` non scattava.
-- Al suo posto c'è `tenant_feature_settings.sales_prices_include_vat`, che è di
-- tenant e non di tipo, ed è esposta in Impostazioni → Prezzi.
--
-- ── 2 · user_product_price_mode_preferences ────────────────────────────────
-- Memoria personale della modalità netto/ivato nella sezione Listini
-- dell'anagrafica articolo. UNA riga. L'anagrafica non è un documento: è una
-- vista del catalogo, e sta dalla stessa parte di report, movimenti e liste —
-- dove serve un riferimento comune, o due colleghi leggono lo stesso listino in
-- due modi. La memoria personale resta solo dove si CREA qualcosa, cioè sui
-- documenti di vendita (`user_document_price_mode_preferences`, che NON si tocca).
--
-- ⚠️ NESSUN DATO ECONOMICO SI PERDE. Le due strutture non contenevano prezzi:
-- contenevano come i prezzi andavano MOSTRATI. I prezzi memorizzati (netti, con
-- la coda decimale) non sono toccati, e la modalità del singolo documento —
-- `documents.prices_include_vat`, `sales_orders.prices_include_vat` — resta dov'è:
-- quella è il dato, non un default.
--
-- ⚠️ AVVERTENZA MESSA A VERBALE. Il database è condiviso, e i rami che leggono
-- ancora queste strutture sono SETTE, `main` compreso — e `main` è quello che
-- Railway ha deployato. Applicata questa migration, su quei rami la creazione di
-- un documento va in errore: Prisma seleziona tutti gli scalari, e la colonna non
-- c'è più. Non è il ramo Casse a essere in mezzo — è ogni ramo non riallineato.
--
-- Si applica lo stesso, per decisione esplicita del proprietario del progetto
-- (17/08/2026): il lavoro si porta a termine pulito, i rami fermi si riallineano
-- al VestiFlow corrente quando verranno ripresi, e nessun tenant è in produzione
-- vera — sono tutti banchi di prova.

ALTER TABLE "document_type_settings"
  DROP COLUMN "prices_include_vat";

DROP TABLE "user_product_price_mode_preferences";
