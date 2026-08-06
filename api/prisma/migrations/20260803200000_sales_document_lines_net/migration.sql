-- Documenti di vendita compilati in modalità IVATA: la riga conteneva il valore
-- digitato, cioè il LORDO, e il flag `prices_include_vat` diceva come leggerlo.
-- Il modello è uno solo: la riga porta il NETTO e l'imposta si calcola. Il flag
-- resta come nota di visualizzazione (come il documento era compilato).
--
-- Senza questa conversione, riaprire una fattura vecchia mostrerebbe il lordo
-- come se fosse netto e il salvataggio successivo aggiungerebbe l'IVA sopra.
--
-- SOLO i tipi che passano dalle maschere di vendita. Gli acquisti (arrivo merce,
-- DDT e fattura fornitore, ordine fornitore) memorizzano GIÀ il netto: hanno una
-- colonna separata per il valore digitato (entered_unit_cost). Toccarli
-- scorporerebbe una seconda volta.
-- Cassa e resi negozio sono già stati convertiti dalla migration precedente.

WITH scorporo AS (
  SELECT
    dl.id,
    ROUND(dl.unit_price_minor * 100.0 / (100 + rate.value))::int AS unit_net,
    ROUND(dl.line_total_minor * 100.0 / (100 + rate.value))::int AS line_net
  FROM "document_lines" dl
  JOIN "documents" d ON d.id = dl.document_id
  CROSS JOIN LATERAL (
    SELECT COALESCE((dl.vat_snapshot ->> 'ratePercent')::numeric, 0) AS value
  ) AS rate
  WHERE d.prices_include_vat = true
    AND d.type IN (
      'proforma',
      'invoice_draft',
      'invoice_accompanying',
      'sales_ddt',
      'quote',
      'manual_unload'
    )
    AND rate.value > 0
)
UPDATE "document_lines" dl
SET
  unit_price_minor = s.unit_net,
  line_total_minor = s.line_net
FROM scorporo s
WHERE s.id = dl.id;

-- I totali di testata NON si toccano: erano corretti quando il documento è stato
-- salvato (imponibile e imposta erano già scorporati) e restano l'importo reale
-- del documento. Un nuovo salvataggio li ricalcola dal netto.
