-- Azzera una volta sola le memorie netto/ivato degli operatori.
--
-- Due gruppi, due ragioni diverse — e vanno tenute distinte, perché una si
-- ripeterà e l'altra no.
--
-- ── 1 · I TIPI DI VENDITA: l'introduzione della convenzione È un cambio ─────
-- Dal 16/08 esiste `tenant_feature_settings.sales_prices_include_vat`, la
-- convenzione aziendale, e cambiarla azzera le memorie dei tipi di vendita
-- (`TenantFeatureSettingsService.update`): senza, il titolare imposta «netto» e
-- ognuno continua a creare ivato per una memoria che non sa di avere.
--
-- Quel meccanismo però scatta su un CAMBIO, e l'introduzione non è stata un
-- cambio: la colonna è nata con `DEFAULT true`, così nessun tenant cambiava
-- comportamento applicando la migration. Risultato: chi aveva già una memoria
-- ha continuato a scavalcare un'impostazione che non aveva mai scelto — ed è
-- esattamente il difetto che l'azzeramento esiste per evitare, in un momento
-- che l'azzeramento non copriva.
--
-- Questa migration copre quel momento. È una tantum: da qui in poi ci pensa il
-- servizio.
--
-- ⚠️ Si buttano scelte che qualcuno aveva fatto. È deliberato e autorizzato
-- (17/08): sono preferenze formate quando una convenzione aziendale non
-- esisteva, quindi non potevano tenerne conto. Chi lavora diversamente rifà la
-- sua scelta al primo documento, e da quel momento torna a essere ricordata.
--
-- ── 2 · I TIPI DI ACQUISTO: sono orfani, non scelte ─────────────────────────
-- Fino al 16/08 la modalità COSTO veniva ricordata in questa tabella — quella
-- dei PREZZI — tradotta da un ponte costo↔prezzo. Il ponte è stato rimosso e i
-- costi partono sempre netti: nessuno scrive più quelle righe e nessuno le
-- legge. Restano come dato morto che contraddice il significato dichiarato
-- della tabella («memoria della modalità prezzi nei documenti di vendita»).
--
-- ── Cosa NON si tocca ───────────────────────────────────────────────────────
-- La tabella resta, e resta il suo mestiere: dopo questo azzeramento gli
-- operatori ricominciano a costruirsi la memoria dei tipi di VENDITA, che è la
-- comodità decisa. E nessun documento già salvato cambia: la sua modalità vive
-- su di lui (`documents.prices_include_vat`, `sales_orders.prices_include_vat`)
-- e non c'entra niente con questa tabella.

DELETE FROM "user_document_price_mode_preferences"
WHERE "document_type" IN (
  -- vendita: la convenzione aziendale prende il posto della memoria
  'proforma',
  'invoice_draft',
  'invoice_accompanying',
  'credit_note',
  'sales_ddt',
  'quote',
  'manual_unload',
  'customer_order',
  -- acquisto: righe orfane, il meccanismo che le scriveva non esiste più
  'supplier_order',
  'goods_receipt',
  'supplier_invoice',
  'manual_load',
  'initial_load'
);
