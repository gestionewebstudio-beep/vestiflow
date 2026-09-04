-- Le garanzie che i vecchi vincoli fornivano, ricostruite nella forma nuova
-- (tranche C1B, `docs/25` §10).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- `20260904140000` ha tolto quattro accoppiamenti a un produttore. Ma quei
-- vincoli non erano SOLO accoppiamenti: risolvevano problemi reali, in una
-- forma troppo rigida. Toglierli e basta lascia dei buchi.
--
-- Verificato su `origin/feature/cassa` (`6e4f9e79`) il 04/09/2026, riga per
-- riga, cosa l'unicita' per sede alimentava davvero:
--
--   fiscal-devices.service.ts     `upsert({ where: { locationId } })`
--                                 la sede ERA la chiave: salvare sovrascriveva
--   frontend                      `PUT /fiscal-devices/{locationId}`
--                                 una sede, un dispositivo, anche nell'API
--   store-sales.service.ts:193    `findFirst({ locationId, enabled: true })`
--                                 deterministico SOLO grazie all'unicita'
--   stesso punto                  «la vendita nasce da fiscalizzare e la cassa
--                                 emette subito dopo la conferma»
--                                 → attivazione AUTOMATICA
--
-- ⛔ Senza l'unicita', quel `findFirst` diventa «un dispositivo a caso». E con
--    `endpoint` non piu' obbligatorio e `adapter_key` aperto, un dispositivo
--    puo' nascere abilitato senza che nessuno sappia parlarci.
--
-- ── LE DUE GARANZIE CHE TORNANO QUI ────────────────────────────────────────
-- Le altre — selezione esplicita, registro statico degli adapter, validazione
-- della configurazione, retry che conserva il dispositivo — vivono nel codice
-- e nel contratto, e si applicano quando quel codice esistera' (C3/C5).
--
-- ⚠️ Sicura perche' `fiscal_devices` ha ZERO righe sul condiviso, misurate in
--    sola lettura il 04/09/2026: nessuna riga esistente viene invalidata dal
--    CHECK, e nessun default cambia sotto dati gia' scritti.

-- ── 1. Il dispositivo nasce SPENTO ─────────────────────────────────────────
--
-- ⭐ Prima, salvare la configurazione la rendeva operativa: era accettabile
--    perche' la sede ne aveva UNO e l'indirizzo era obbligatorio, quindi non
--    poteva essere incompleta. Ora che entrambe le cose sono cadute, un
--    default `true` significherebbe «attivo appena censito, anche senza
--    sapergli parlare».
--
-- ⚠️ Cambia solo il DEFAULT: le righe esistenti non si toccano (e non ce ne
--    sono). Chi passa un valore esplicito continua a decidere.
ALTER TABLE "fiscal_devices" ALTER COLUMN "enabled" SET DEFAULT false;

-- ── 2. Non si abilita un dispositivo con cui non si sa parlare ─────────────
--
-- ⛔ Il controllo sta nel DATABASE e non solo nel servizio: e' la stessa
--    disciplina del CHECK sulle modalita' di pagamento (C2A). Una guardia che
--    vive in un solo percorso applicativo si aggira dal percorso dopo.
--
-- ⚠️ `adapter_key` resta nullable: un dispositivo si censisce prima di sapere
--    quale adapter lo governa. Cio' che non puo' fare e' essere ABILITATO in
--    quello stato.
ALTER TABLE "fiscal_devices"
  ADD CONSTRAINT "fiscal_devices_enabled_requires_adapter"
  CHECK ("enabled" = false OR "adapter_key" IS NOT NULL);
