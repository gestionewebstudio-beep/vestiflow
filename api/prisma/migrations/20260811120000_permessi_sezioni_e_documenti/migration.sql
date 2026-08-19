-- Ristrutturazione permessi «sezioni + documenti + azioni» (decisione prodotto
-- 2026-08-11). Le sei chiavi legacy (documents.view/manage, supplier_orders.
-- manage/receive, customers.view, reports.view) vengono ESPANSE nelle nuove —
-- chiavi di sezione (`section.*`) e matrice per famiglia documento
-- (`doc.<famiglia>.view|manage`) — e poi rimosse. L'espansione riproduce
-- esattamente l'accesso effettivo di prima: nessun utente perde nulla con il
-- deploy. Gli owner restano ad array vuoto (accesso pieno, array ignorato).
-- Nessuna modifica di schema: solo dati.

-- ── Sezioni: derivate da ciò che oggi apre ciascuna area ────────────────────
UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.products']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['catalog.manage','catalog.import_export','catalog.delete','inventory.manage','inventory.import_export','supplier_orders.manage','supplier_orders.receive'];

UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.inventory']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['inventory.manage','inventory.import_export','inventory.view_all_locations'];

UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.suppliers']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['supplier_orders.manage','supplier_orders.receive'];

UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.documents']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['documents.view','documents.manage','supplier_orders.receive'];

UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.sales']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['reports.view','retail.register','retail.register_online'];

UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.customers']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['customers.view','customers.manage'];

UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.reports']
WHERE "role" <> 'owner' AND "permissions" && ARRAY['reports.view'];

-- Impostazioni era aperta a ogni utente autenticato (decisione documentata in
-- settings.routes): con il gate di sezione, tutti gli utenti storici la
-- conservano. Per i nuovi decide il preset del ruolo (o il titolare).
UPDATE "users" SET "permissions" = "permissions" || ARRAY['section.settings']
WHERE "role" <> 'owner';

-- ── Matrice documenti: espansione delle chiavi registro ─────────────────────
-- documents.view -> consultazione delle 10 famiglie del registro.
UPDATE "users" SET "permissions" = "permissions" || ARRAY[
  'doc.goods_receipt.view','doc.purchase_invoice.view','doc.quote.view','doc.proforma.view','doc.sales_ddt.view','doc.invoice.view','doc.store_sale.view','doc.transfer.view','doc.adjustment.view','doc.manual_unload.view'
]
WHERE "role" <> 'owner' AND 'documents.view' = ANY("permissions");

-- documents.manage -> gestione (e consultazione) delle 10 famiglie, più
-- l'ordine cliente manuale, che oggi è gated proprio da documents.manage.
UPDATE "users" SET "permissions" = "permissions" || ARRAY[
  'doc.goods_receipt.view','doc.purchase_invoice.view','doc.quote.view','doc.proforma.view','doc.sales_ddt.view','doc.invoice.view','doc.store_sale.view','doc.transfer.view','doc.adjustment.view','doc.manual_unload.view',
  'doc.goods_receipt.manage','doc.purchase_invoice.manage','doc.quote.manage','doc.proforma.manage','doc.sales_ddt.manage','doc.invoice.manage','doc.store_sale.manage','doc.transfer.manage','doc.adjustment.manage','doc.manual_unload.manage',
  'doc.sales_order.view','doc.sales_order.manage'
]
WHERE "role" <> 'owner' AND 'documents.manage' = ANY("permissions");

-- supplier_orders.manage -> ordine fornitore pieno.
UPDATE "users" SET "permissions" = "permissions" || ARRAY['doc.supplier_order.view','doc.supplier_order.manage']
WHERE "role" <> 'owner' AND 'supplier_orders.manage' = ANY("permissions");

-- supplier_orders.receive -> vede gli ordini fornitore e gestisce l'arrivo merce.
UPDATE "users" SET "permissions" = "permissions" || ARRAY['doc.supplier_order.view','doc.goods_receipt.view','doc.goods_receipt.manage']
WHERE "role" <> 'owner' AND 'supplier_orders.receive' = ANY("permissions");

-- reports.view gated anche lo storico vendite: ordini cliente e vendite online.
UPDATE "users" SET "permissions" = "permissions" || ARRAY['doc.sales_order.view','doc.online_sale.view']
WHERE "role" <> 'owner' AND 'reports.view' = ANY("permissions");

-- ── Dedupe e rimozione delle chiavi legacy ──────────────────────────────────
UPDATE "users" SET "permissions" = (
  SELECT COALESCE(array_agg(DISTINCT p), ARRAY[]::text[])
  FROM unnest("permissions") AS p
  WHERE p NOT IN ('documents.view','documents.manage','supplier_orders.manage','supplier_orders.receive','customers.view','reports.view')
)
WHERE "role" <> 'owner';
