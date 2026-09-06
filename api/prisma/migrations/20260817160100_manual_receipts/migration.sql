-- Il Corrispettivo manuale: una registrazione ECONOMICA autonoma nel Registro.
--
-- Specifica: `docs/10-specifica-registro-corrispettivi.md` §12.
-- Censimento che ha stabilito che non esisteva gia': `10` §11 (verdetto A —
-- la verticale legacy era solo il duplicatore automatico).
--
-- ── A COSA SERVE ────────────────────────────────────────────────────────────
-- Registrare un importo che VestiFlow conosce quando la vendita analitica NON
-- esiste e non e' ricostruibile: la cassa esterna ha battuto mentre VestiFlow
-- non era disponibile, una chiusura di cassa da recuperare, importi storici di
-- cui si sanno importo e IVA ma non gli articoli.
--
-- ⚠️ Righe SENZA articolo, e non e' una semplificazione: e' la definizione.
-- Una registrazione che non conosce gli articoli non puo' muovere quantita', e
-- se un giorno qualcuno provasse a farlo starebbe inventando merce. Nessun
-- `StockMovement`, nessun `Document`, nessun `SalesOrder`, nessun pagamento.
--
-- ── LA REGOLA DEL DENARO, APPLICATA ─────────────────────────────────────────
-- `entered_amount_minor` e' l'importo COME DIGITATO (ivato o netto secondo la
-- modalita' della testata); `net_amount_minor` e' il netto CANONICO con la coda
-- decimale. Sono entrambi NUMERIC(16,6), ed e' la coda a far tornare 70,00
-- identico alla riapertura in modalita' ivata — con un intero si leggerebbe
-- 69,99. La coppia digitato+canonico non e' inventata qui: e' gia' in
-- produzione su `supplier_order_lines` (entered_unit_cost_minor/unit_cost_minor).
--
-- Gli esiti di riga e i totali di testata sono INTERI: si arrotonda una volta
-- sola, sul totale di riga, mai sull'unitario.
--
-- ── LA LOCATION E' OBBLIGATORIA, E NON E' UNA CONVALIDA DI MASCHERA ─────────
-- `location_id NOT NULL`. Non esiste un Corrispettivo manuale con location non
-- determinata: e' una regola del modello. Il «Non determinata» che il Registro
-- mostra riguarda le righe SHOPIFY, dove il dato oggi puo' mancare o essere
-- stato indovinato dal ripiego alfabetico della sync — anomalia temporanea
-- tracciata nel blocco sincronizzazione, non uno stato di questo modello.
--
-- ── NUMERAZIONE ─────────────────────────────────────────────────────────────
-- `series`/`number` come su `sales_orders`: il motore comune partiziona per
-- (tenant, tipo, serie) e «senza serie» E' `NULL` — da cui NULLS NOT DISTINCT,
-- che Prisma non sa esprimere e va scritto qui a mano.
--
-- ⚠️ `series` resta sempre NULL e non compare in nessuna maschera: la colonna
-- esiste solo perche' la partizione del motore comune la richiede. Non stiamo
-- introducendo una gestione serie dei Corrispettivi manuali.
--
-- I buchi sono ammessi: eliminando il n. 12 si passa da 11 a 13, e non si
-- rinumera mai. Il numero identifica la registrazione, non e' un progressivo
-- fiscale — il documento commerciale dell'RT e' un'altra cosa.
--
-- ── ELIMINAZIONE: SEMPLICE, PER SCELTA ──────────────────────────────────────
-- Niente `status`, niente soft-delete, niente `deleted_at`, niente
-- controregistrazione. Tre verbi: creare, modificare, eliminare. Le righe se ne
-- vanno in cascata. La conseguenza e' dichiarata in `10` §12: un export di
-- agosto ristampato a settembre non conterra' piu' la registrazione cancellata.
-- E' il prezzo di non costruire un impianto di audit che il progetto non ha da
-- nessun'altra parte (misurato: un solo soft-delete vero in tutto lo schema, e
-- `updated_by` non esiste in nessuna tabella).

CREATE TABLE "manual_receipts" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID          NOT NULL,
  -- Sempre NULL: vedi sopra. Esiste per la partizione del numeratore comune.
  "series"              TEXT,
  "number"              INTEGER       NOT NULL,
  -- UNA sola data, economica: e' quella che determina il periodo del Registro.
  -- Il legacy ne aveva due perche' una nasceva dal canale e l'altra la
  -- correggeva l'operatore. Qui la digita l'operatore, ed e' una.
  "document_date"       DATE          NOT NULL,
  "location_id"         UUID          NOT NULL,
  -- Nasce IVATO, al contrario di documents/sales_orders che nascono netti: il
  -- caso operativo e' riportare i valori di una chiusura di cassa, che sono
  -- ivati. Il selettore resta modificabile.
  "prices_include_vat"  BOOLEAN       NOT NULL DEFAULT true,
  "notes"               TEXT,
  "currency"            TEXT          NOT NULL DEFAULT 'EUR',
  -- Totali gia' arrotondati: sono i tre numeri che il Registro consuma.
  "subtotal_minor"      INTEGER       NOT NULL DEFAULT 0,
  "tax_minor"           INTEGER       NOT NULL DEFAULT 0,
  "total_minor"         INTEGER       NOT NULL DEFAULT 0,
  "created_by_id"       UUID,
  -- Snapshot del nome: l'audit regge anche se l'utente cambia nome o sparisce.
  "created_by_name"     TEXT          NOT NULL,
  "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manual_receipts_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT: due «senza serie» sono la STESSA serie, altrimenti il
-- vincolo non morderebbe mai (in SQL standard NULL <> NULL). Prisma non lo
-- esprime: sta qui a mano, come per `documents` e `document_counters`.
CREATE UNIQUE INDEX "manual_receipts_number_unique"
  ON "manual_receipts" ("tenant_id", "series", "number") NULLS NOT DISTINCT;

-- Il Registro interroga per periodo e per sede: sono le due domande che fa.
CREATE INDEX "manual_receipts_tenant_date_idx"
  ON "manual_receipts" ("tenant_id", "document_date");
CREATE INDEX "manual_receipts_tenant_location_idx"
  ON "manual_receipts" ("tenant_id", "location_id");

ALTER TABLE "manual_receipts"
  ADD CONSTRAINT "manual_receipts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT e non SetNull: la colonna e' NOT NULL, e una registrazione senza
-- sede non deve poter esistere nemmeno per via indiretta. Se una sede va
-- eliminata mentre porta corrispettivi, il database si oppone — ed e' giusto
-- che se ne accorga chi elimina, non chi legge il registro sei mesi dopo.
ALTER TABLE "manual_receipts"
  ADD CONSTRAINT "manual_receipts_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "manual_receipts"
  ADD CONSTRAINT "manual_receipts_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "manual_receipt_lines" (
  "id"                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  "receipt_id"            UUID           NOT NULL,
  "line_number"           INTEGER        NOT NULL,
  -- Testo libero, obbligatorio. Nessun articolo, nessuno SKU, nessuna variante:
  -- vedi la nota in testa.
  "description"           TEXT           NOT NULL,
  -- L'importo COME DIGITATO, nella modalita' della testata.
  "entered_amount_minor"  NUMERIC(16,6)  NOT NULL,
  -- Il netto CANONICO con la coda: e' questo che fa tornare 70,00 identico.
  "net_amount_minor"      NUMERIC(16,6)  NOT NULL,
  "vat_code_id"           UUID,
  -- Obbligatorio, a differenza di `document_lines` dove e' facoltativo: una
  -- riga senza IVA in un corrispettivo non ha senso. Anche i codici non
  -- imponibili ed esenti passano di qui — un Codice IVA VestiFlow vero, mai una
  -- riga fiscalmente indefinita.
  "vat_snapshot"          JSONB          NOT NULL,
  -- I tre esiti ARROTONDATI della riga.
  "net_minor"             INTEGER        NOT NULL DEFAULT 0,
  "vat_minor"             INTEGER        NOT NULL DEFAULT 0,
  "gross_minor"           INTEGER        NOT NULL DEFAULT 0,
  "created_at"            TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manual_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manual_receipt_lines_receipt_idx"
  ON "manual_receipt_lines" ("receipt_id", "line_number");

ALTER TABLE "manual_receipt_lines"
  ADD CONSTRAINT "manual_receipt_lines_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "manual_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL e non RESTRICT: lo snapshot congelato sulla riga conserva aliquota e
-- descrizione, quindi la registrazione storica resta leggibile anche se il
-- Codice IVA viene eliminato. E' il motivo per cui lo snapshot esiste.
ALTER TABLE "manual_receipt_lines"
  ADD CONSTRAINT "manual_receipt_lines_vat_code_id_fkey"
  FOREIGN KEY ("vat_code_id") REFERENCES "vat_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration
-- che crea le tabelle. L'API si connette come owner e bypassa la RLS; la
-- anon/publishable key, che finisce nel bundle JS, no. Senza queste quattro
-- righe la Data API esporrebbe le tabelle a chiunque abbia quella chiave,
-- scavalcando il filtro tenant. Lo verifica `npm run check:rls` in CI.
ALTER TABLE "manual_receipts"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_receipt_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "manual_receipts"      FROM anon, authenticated;
REVOKE ALL ON "manual_receipt_lines" FROM anon, authenticated;
