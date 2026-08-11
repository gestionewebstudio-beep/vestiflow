-- L'unicita' del numero segue il NUMERATORE, non il tipo documento.
--
-- La Fattura accompagnatoria non ha una propria numerazione: eredita quella
-- della Fattura, ed e' giusto cosi' — e' una fattura a tutti gli effetti e deve
-- stare nella stessa serie progressiva. Il codice lo fa gia' in lettura
-- (`documentNumberingType`: invoice_accompanying → invoice_draft, in
-- `api/src/documents/document-type.util.ts`), ma l'indice unico partizionava sul
-- tipo GREZZO. I due non coincidevano solo per quel tipo, e la conseguenza era
-- questa:
--
--   1. si crea una Fattura accompagnatoria: il massimo si legge fra le Fatture
--      (5) → prende il 6;
--   2. si crea una Fattura: il massimo si legge sempre fra le Fatture, che sono
--      ancora ferme a 5 (l'accompagnatoria e' di un altro tipo) → prende il 6;
--   3. l'indice non vede la collisione, perche' i due `type` sono diversi.
--
-- Risultato: due documenti fiscali con lo stesso numero, e la stampa non li
-- distingue. Verificato prima di scrivere questa migration che in produzione non
-- esista alcuna collisione — e che i documenti dei due tipi siano ancora ZERO:
-- l'indice si puo' quindi ricreare senza bonifiche.
--
-- Nota sull'espressione: il CASE su un enum e' IMMUTABLE, quindi indicizzabile.
-- Se un domani un altro tipo dovesse condividere il numeratore, va aggiunto QUI
-- oltre che in `documentNumberingType`: sono due facce dello stesso patto, e
-- disallinearle e' esattamente il difetto che questa migration chiude.

DROP INDEX IF EXISTS "documents_number_unique";

CREATE UNIQUE INDEX "documents_number_unique"
  ON "documents" (
    "tenant_id",
    (
      CASE
        WHEN "type" = 'invoice_accompanying'::"DocumentType"
          THEN 'invoice_draft'::"DocumentType"
        ELSE "type"
      END
    ),
    "series",
    "number"
  )
  NULLS NOT DISTINCT
  WHERE "number" IS NOT NULL;
