-- ⭐ I DATI DI PAGAMENTO DEL FORNITORE — chiesti dal proprietario il 01/09/2026,
--    guardando l'anagrafica Danea: «manca qualche dato forse essenziale? l'iban
--    o altro?».
--
--    Sì, e l'IBAN era il solo davvero essenziale: un fornitore lo si paga con un
--    bonifico, la modalità di pagamento c'era già ma il dato con cui il bonifico
--    si fa no — si andava a cercarlo fuori dal gestionale ogni volta.
--
-- ⭐ TRE COLONNE, DUE TABELLE, e la divisione non è arbitraria:
--
--      iban          → parties    è il conto di CHI INCASSA, cioè del soggetto.
--                                 Se lo stesso soggetto è anche cliente, l'IBAN
--                                 è quello: non ne ha due.
--      mobile_phone  → parties    è un recapito del soggetto, come `phone`.
--      our_bank_name → suppliers  è la NOSTRA banca per questo rapporto: una
--                                 scelta nostra, non un dato suo.
--
--    Danea le mostra tutte e tre nella stessa scheda perché non separa soggetto
--    e ruolo; VestiFlow sì, e il commento di `Party` lo dichiara — «l'anagrafica
--    comune vive su Party, i dati commerciali sono del ruolo».
--
-- ⚠️ ADDITIVA E REVERSIBILE: tre colonne facoltative, nessuna riga cambia,
--    nessun vincolo si muove. Le anagrafiche esistenti restano valide e vuote.
--
-- ⚠️ SCRITTA A MANO, come impone `regole-qualita`: su questo database condiviso
--    `prisma migrate diff` propone di cancellare le tabelle degli altri rami.

ALTER TABLE "parties" ADD COLUMN "mobile_phone" TEXT;
ALTER TABLE "parties" ADD COLUMN "iban" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "our_bank_name" TEXT;
