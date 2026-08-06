-- Tranche 2 del modulo cassa: mappa aliquota IVA → reparto della stampante
-- fiscale. Le RT non ricevono l'aliquota sulla riga: la deducono dal reparto
-- configurato a bordo macchina. La mappa vive sulla configurazione del
-- dispositivo (es. [{"ratePercent":22,"department":1}]).

ALTER TABLE "fiscal_devices" ADD COLUMN "vat_departments" JSONB;
