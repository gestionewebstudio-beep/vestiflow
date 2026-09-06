-- Il prezzo barrato diventa un prezzo di vendita come gli altri.
--
-- ── PERCHÉ ─────────────────────────────────────────────────────────────────
-- Nell'anagrafica sei valori commerciali stanno sotto UN selettore netto/ivato:
-- prezzo di vendita, prezzo Shopify, listino 1/2/3 — e il barrato, che era
-- l'unico a **ignorarlo in silenzio**. Il tooltip lo diceva («si inserisce come
-- va mostrato al cliente»), il codice lo confermava (`compareAtPrice` fuori da
-- `PRICE_FIELDS`), ma a schermo i sei campi sembravano governati dallo stesso
-- interruttore.
--
-- ⚠️ E la conseguenza usciva dal gestionale: verso Shopify la stessa riga
-- variante portava `price` NETTO (segue il selettore) e `compare_at_price`
-- IVATO (non lo segue). Due basi diverse affiancate sotto gli occhi del
-- cliente, con lo «sconto» mostrato gonfiato dell'aliquota.
--
-- ── LE DUE PARTI, E PERCHÉ LA PRIMA NON BASTA ──────────────────────────────
-- `Int → Decimal(16,6)` è senza perdita NUMERICA: ogni intero è un decimale con
-- coda zero. Ma **la semantica cambia**, ed è la parte che non va confusa con
-- la prima: oggi quel numero è «come digitato», domani è «netto canonico».
--
-- Un 70,00 scritto da chi intendeva 70 € ivati verrebbe riletto come 70 € netti
-- e mostrato, in modalità ivata, come 85,40.
--
-- ── PERCHÉ I VALORI ESISTENTI VANNO A NULL ─────────────────────────────────
-- Misurati prima di decidere: **6 prodotti su 250**, tutti dello stesso tenant
-- di prova, tutti al 22%, creati fra il 30/06 e il 07/08 — e i nomi lo dicono
-- («test import listini», «Test dopo aggiornamento listini», «The Compare at
-- Price Snowboard», che è un prodotto demo di Shopify). Uno ha prezzo di
-- vendita 0,00 e barrato 885,95: non è un caso d'uso, è un import di prova.
--
-- Tutti e sei cambierebbero a schermo in modalità ivata. Un barrato sbagliato
-- del 22% non è un dato impreciso: è un **prezzo falso in vetrina**, ed è ciò
-- che quel campo pubblica su Shopify.
--
-- `NULL` e non `0`: il barrato è facoltativo, e zero direbbe «esiste e vale
-- zero». `isValidCompareAt` lo scarterebbe comunque, quindi zero sarebbe uno
-- stato che significa due cose.
--
-- ⚠️ È una cancellazione: sei valori spariscono, ed è deliberato (decisione del
-- 17/08). Chi vuole un barrato lo ridigita nella modalità che ha davanti.
--
-- ── COSA RESTA FUORI, ED È TRACCIATO ───────────────────────────────────────
--   · la convenzione `taxes_included` verso Shopify: VestiFlow non legge se il
--     negozio vuole imponibili o prezzi finali, e su quello italiano manca il
--     18,03% su ogni pezzo (`PREZZI-SHOPIFY-SPEC.md` §1). Questa migration NON
--     lo risolve — allinea le due basi INTERNE, che è un'altra cosa;
--   · il pull legge il `compare_at_price` della sola PRIMA variante e lo scrive
--     sull'articolo: limite della modellazione articolo/varianti, blocco Shopify.

UPDATE "products" SET "compare_at_price_minor" = NULL
WHERE "compare_at_price_minor" IS NOT NULL;

ALTER TABLE "products"
  ALTER COLUMN "compare_at_price_minor" TYPE numeric(16, 6);
