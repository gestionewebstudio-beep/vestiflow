-- La Nota di credito entra nel numeratore della Fattura.
--
-- Seconda meta' del patto descritto in 20260811090000: l'unicita' del numero
-- segue il NUMERATORE, non il tipo grezzo, e quella migration chiude dicendo
-- testualmente che «se un domani un altro tipo dovesse condividere il
-- numeratore, va aggiunto QUI oltre che in documentNumberingType». Quel domani
-- e' la Nota di credito.
--
-- I tre tipi della famiglia Fattura — Fattura, Fattura accompagnatoria, Nota di
-- credito — hanno UN SOLO progressivo (specifica 07 §2). Senza questa riga
-- l'indice partizionerebbe la nota per conto suo, e una Fattura 7 e una Nota di
-- credito 7 potrebbero convivere nella stessa serie senza che nessuno se ne
-- accorga: due documenti fiscali con lo stesso numero.
--
-- ── Perche' e' un file separato dall'enum ────────────────────────────────────
-- `ALTER TYPE ... ADD VALUE` (migration 20260807020000) puo' stare in una
-- transazione, ma il valore aggiunto NON e' utilizzabile finche' quella
-- transazione non ha fatto commit. Prisma esegue ogni file in una transazione:
-- usare 'credit_note' qui dentro, insieme all'ADD VALUE, fallirebbe. I due file
-- vanno quindi in quest'ordine, e l'ordine e' garantito dal nome della cartella.
--
-- ── Cosa succede se esistono collisioni ──────────────────────────────────────
-- `CREATE UNIQUE INDEX` fallisce se due documenti dello stesso tenant e della
-- stessa serie portano lo stesso numero fra i tipi che il CASE unifica. La
-- verifica va rifatta NEL MOMENTO in cui si applica, non prima: il database e'
-- condiviso e il ramo del collega e' attivo. La query e' in
-- `docs/07-specifica-famiglia-fattura.md` §2.

DROP INDEX IF EXISTS "documents_number_unique";

CREATE UNIQUE INDEX "documents_number_unique"
  ON "documents" (
    "tenant_id",
    (
      CASE
        WHEN "type" IN (
          'invoice_accompanying'::"DocumentType",
          'credit_note'::"DocumentType"
        )
          THEN 'invoice_draft'::"DocumentType"
        ELSE "type"
      END
    ),
    "series",
    "number"
  )
  NULLS NOT DISTINCT
  WHERE "number" IS NOT NULL;
