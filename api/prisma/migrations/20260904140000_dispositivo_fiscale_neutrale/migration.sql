-- Il dispositivo fiscale smette di presupporre un produttore, una rete e una
-- sola cassa per sede (tranche C1B, `docs/25` §10).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- `fiscal_devices` nasceva attorno a una stampante Epson raggiungibile in LAN
-- e chiamata dal browser: un indirizzo obbligatorio, un vincolo unico sulla
-- sede, e il produttore come unico modo di sapere con chi si sta parlando. Un
-- nucleo cosi' non regge una seconda marca, un agente locale o un servizio
-- cloud senza essere riscritto.
--
-- ⛔ La Cassa non si progetta intorno a un fornitore. Epson resta il
--    riferimento storico del vecchio ramo e potra' diventare UN adapter.
--
-- ── PERCHE' SI PUO' FARE ORA, E SENZA RISCHIO ──────────────────────────────
-- Misurato sul database condiviso il 04/09/2026, in sola lettura:
--
--   fiscal_devices    0 righe        fiscal_receipts   0 righe
--   nessun servizio applicativo legge o scrive queste tabelle
--   l'unica FK entrante (fiscal_receipts.device_id) parte da una tabella vuota
--
-- Non c'e' un dato da convertire ne' un consumer da adeguare: la modifica
-- struttura una tabella che nessuno ha ancora usato.
--
-- ── COMPATIBILE COL CODICE PRECEDENTE ──────────────────────────────────────
--   · le colonne nuove sono NULLABLE;
--   · `endpoint` si ALLARGA da NOT NULL a NULL — chi scriveva un valore
--     continua a poterlo fare;
--   · l'indice unico sulla sede diventa un indice normale: si toglie un
--     divieto, non se ne aggiunge uno;
--   · nessuna rinomina, nessun DROP di colonna, nessun dato riscritto.

-- ── 1. Piu' dispositivi sulla stessa sede ──────────────────────────────────
--
-- ⚠️ L'unicita' impediva due casse affiancate e perfino il muletto durante un
--    guasto. Al suo posto un indice normale: la ricerca per sede resta veloce,
--    ma QUALE dispositivo si usa diventa una scelta esplicita del chiamante
--    (`docs/25` §10), mai «il primo trovato».
DROP INDEX IF EXISTS "fiscal_devices_location_id_key";

CREATE INDEX IF NOT EXISTS "fiscal_devices_location_id_idx"
  ON "fiscal_devices"("location_id");

-- ── 2. L'indirizzo di collegamento diventa opzionale ───────────────────────
--
-- Il trasporto non e' deciso: browser verso LAN, agente locale nel negozio,
-- backend verso un gateway, o API cloud del fornitore. Le ultime due possono
-- non avere alcun indirizzo da configurare qui, e un NOT NULL le escluderebbe
-- prima ancora di valutarle.
ALTER TABLE "fiscal_devices" ALTER COLUMN "endpoint" DROP NOT NULL;

-- ── 3. Produttore e adapter diventano due cose diverse ─────────────────────
--
-- ⭐ `adapter_key` e' la chiave APERTA e VERSIONABILE che seleziona il
--    componente tecnico: `<fornitore>.<protocollo>.<versione>`. Testo e non
--    enum di proposito — un enum obbligherebbe a una migration, cioe' a
--    toccare il dominio della Cassa, per ogni fornitore nuovo.
--
-- ⚠️ `brand` resta, e resta un enum: da qui in avanti e' informazione
--    DESCRITTIVA per chi legge l'elenco, non il selettore del codice. Il
--    valore `other` permette una marca nuova senza migration.
ALTER TABLE "fiscal_devices" ADD COLUMN "adapter_key" TEXT;

-- Parametri dell'adapter.
-- ⛔ Nessun segreto: chiavi e password stanno dove stanno gli altri segreti
--    (`regole-sicurezza`), mai in una colonna leggibile del tenant.
ALTER TABLE "fiscal_devices" ADD COLUMN "adapter_config" JSONB;

-- ── 4. Il firmware e' un dato, non una nota ────────────────────────────────
--
-- Il comportamento fiscale puo' cambiare fra due firmware dello STESSO
-- modello: tenerlo in `notes` significa non poterlo confrontare.
ALTER TABLE "fiscal_devices" ADD COLUMN "firmware_version" TEXT;
