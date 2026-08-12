-- `reports.fiscal_register` — le tre scritture del registro fiscale (consegna
-- al commercialista, stato fiscale di un ordine, riga del registro
-- corrispettivi) stavano dietro «Esportare dati»: chi scaricava un CSV poteva
-- anche modificare la contabilità. Ora hanno una chiave propria.
--
-- Nessuna regressione: la si concede a chi quelle scritture le stava già
-- facendo, cioè a chi ha `reports.export`.

UPDATE "users" SET "permissions" = "permissions" || ARRAY['reports.fiscal_register']
WHERE "role" <> 'owner'
  AND 'reports.export' = ANY("permissions")
  AND NOT ('reports.fiscal_register' = ANY("permissions"));
