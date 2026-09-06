-- Perché: da questa versione l'array users.permissions è l'UNICA verità per i
-- ruoli non-owner (array vuoto = nessun permesso, scelta esplicita). Finora un
-- array vuoto ricadeva a runtime sui default del ruolo (normalizeStoredPermissions
-- / resolveEffectivePermissions): con la gestione utenti delegata al titolare
-- quel fallback rende irrappresentabile «zero permessi» — smarcare tutte le
-- caselle riattivava i preset in silenzio. Qui i default vengono materializzati
-- sugli utenti storici, così il deploy non cambia i permessi effettivi di
-- nessuno. Gli owner restano ad array vuoto (accesso pieno by design, l'array
-- è ignorato). Nessuna modifica di schema: solo dati.

UPDATE "users" SET "permissions" = ARRAY[
  'inventory.manage',
  'supplier_orders.receive',
  'documents.view',
  'retail.register',
  'retail.register_online',
  'reports.view',
  'customers.view'
]
WHERE "role" = 'clerk' AND cardinality("permissions") = 0;

UPDATE "users" SET "permissions" = ARRAY[
  'inventory.view_all_locations',
  'inventory.manage',
  'inventory.import_export',
  'catalog.manage',
  'catalog.import_export',
  'catalog.view_purchase_costs',
  'supplier_orders.manage',
  'supplier_orders.receive',
  'documents.view',
  'documents.manage',
  'retail.register',
  'retail.register_online',
  'reports.view',
  'reports.export',
  'customers.view',
  'customers.manage'
]
WHERE "role" = 'manager' AND cardinality("permissions") = 0;

UPDATE "users" SET "permissions" = ARRAY[
  'inventory.view_all_locations',
  'inventory.manage',
  'inventory.import_export',
  'catalog.manage',
  'catalog.import_export',
  'catalog.delete',
  'catalog.view_purchase_costs',
  'supplier_orders.manage',
  'supplier_orders.receive',
  'documents.view',
  'documents.manage',
  'retail.register',
  'retail.register_online',
  'reports.view',
  'reports.export',
  'settings.company',
  'customers.view',
  'customers.manage'
]
WHERE "role" = 'admin' AND cardinality("permissions") = 0;
