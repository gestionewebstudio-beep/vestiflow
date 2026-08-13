-- I dati dell'azienda che finora nessuno poteva dichiarare, e che i documenti
-- danno per scontati.
--
-- **Regime fiscale.** L'XML FatturaPA scriveva `RF01` cablato nel codice, con
-- tanto di commento «VestiFlow non lo gestisce». Per un negozio in forfettario
-- (RF19) significa un dato fiscale falso su ogni fattura trasmessa allo SdI.
-- NULL resta RF01, che è il caso ordinario e il comportamento di prima: chi non
-- tocca niente non cambia niente.
--
-- **Registro Imprese.** Per le società l'art. 2250 c.c. vuole sugli atti e sulla
-- corrispondenza l'ufficio del registro, il numero REA, il capitale sociale e —
-- se ricorrono — socio unico e stato di liquidazione. Sono anche i campi del
-- blocco `IscrizioneREA` della fattura elettronica.
--
-- `share_capital_minor` in centesimi come ogni altro importo del gestionale
-- (regole-gestionale, «Denaro»): l'arrotondamento avviene solo in uscita.
--
-- `sole_shareholder` è a tre stati di proposito: NULL = non dichiarato, e non
-- va confuso con «più soci». Il primo non si stampa, il secondo sì.

ALTER TABLE "company_profiles"
    ADD COLUMN "email" TEXT,
    ADD COLUMN "website" TEXT,
    ADD COLUMN "tax_regime" TEXT,
    ADD COLUMN "rea_office" TEXT,
    ADD COLUMN "rea_number" TEXT,
    ADD COLUMN "share_capital_minor" INTEGER,
    ADD COLUMN "sole_shareholder" BOOLEAN,
    ADD COLUMN "in_liquidation" BOOLEAN NOT NULL DEFAULT false;
