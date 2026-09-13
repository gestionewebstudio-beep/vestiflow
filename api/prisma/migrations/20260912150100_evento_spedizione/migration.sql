-- OnlineOrderEventType: la SPEDIZIONE acquisita (12/09/2026).
--
-- ⭐ PERCHE'. Il connettore traduce ogni `fulfillment` riuscito del payload in un
--    evento canonico `online_order_shipped`, ripetibile per ordine (suffisso =
--    id evasione + versione del payload). Gli effetti — scarico per sede,
--    consumo dell'impegno per la quantita' uscita — sono idempotenti RIGA PER
--    RIGA in `sales_order_shipment_lines` (migration precedente): un webhook
--    ripetuto o un recupero non scaricano due volte.
--
-- ⚠️ File a parte: `ADD VALUE` non si puo' USARE nella stessa transazione in cui
--    nasce, e le migration girano in transazione.
--
-- ⛔ NON applicata al database CONDIVISO.

ALTER TYPE "OnlineOrderEventType" ADD VALUE IF NOT EXISTS 'online_order_shipped';
