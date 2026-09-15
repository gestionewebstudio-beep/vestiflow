-- La FK delle ricevute webhook verso il tenant segue il MODELLO delle tabelle di dati
-- (products, inventory_levels, online_order_events…): RESTRICT, con la purga esplicita
-- del ripristino e della cancellazione del tenant — le ricevute stanno nel backup (v6) e
-- passano dall'elenco delle entita'. La cascata era una supposizione (15/09/2026):
-- corretta prima di ogni applicazione fuori dal database di prova.
--
-- La corsia (`shopify_webhook_lanes`) resta in cascata: e' una rivendicazione di processo,
-- non un dato — come `tenant_user_audit_logs`, «sparisce insieme al proprio tenant».
ALTER TABLE "shopify_webhook_receipts"
  DROP CONSTRAINT "shopify_webhook_receipts_tenant_id_fkey",
  ADD CONSTRAINT "shopify_webhook_receipts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
