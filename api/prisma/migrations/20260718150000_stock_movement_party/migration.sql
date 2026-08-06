-- Registra movimento (form multi-riga): controparte facoltativa del movimento
-- (provenienza merce per i carichi, destinatario per gli scarichi), salvata
-- come riferimento + snapshot nome per display stabile, come nei documenti.
ALTER TABLE "stock_movements" ADD COLUMN "party_id" UUID;
ALTER TABLE "stock_movements" ADD COLUMN "party_name" TEXT;
