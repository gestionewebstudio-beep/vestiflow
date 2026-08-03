-- La cassa memorizzava il prezzo di riga IVA INCLUSA e scorporava l'imposta per
-- i totali. Il modello è l'opposto e vale per tutti: il valore memorizzato è
-- sempre NETTO, l'IVA si calcola. Il codice ora fa così; qui si allineano le
-- righe già registrate, altrimenti un reso su una vendita vecchia rimborserebbe
-- il lordo trattandolo come imponibile (+22%).
--
-- Solo vendite e resi di negozio: gli altri documenti hanno il loro percorso.
-- L'aliquota è quella CONGELATA sulla riga (vat_snapshot), non quella di oggi.
-- Righe senza aliquota: netto e lordo coincidono, niente da convertire.

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
  WHERE d.type IN ('store_sale', 'store_return')
    AND rate.value > 0
)
UPDATE "document_lines" dl
SET
  unit_price_minor = s.unit_net,
  -- line_total_minor è l'IMPONIBILE di riga (lo dice lo schema): conteneva il lordo.
  line_total_minor = s.line_net,
  line_vat_total_minor = dl.line_total_minor - s.line_net,
  -- Il lordo non cambia: è quello che il cliente ha pagato davvero.
  line_gross_total_minor = dl.line_total_minor
FROM scorporo s
WHERE s.id = dl.id;

-- I resi non scorporavano affatto l'imposta (tax_minor = 0): il totale resta
-- quello rimborsato, imponibile e imposta si ricavano dalle righe corrette sopra.
WITH totali AS (
  SELECT
    dl.document_id,
    SUM(dl.line_total_minor)::int AS subtotal,
    SUM(dl.line_vat_total_minor)::int AS tax
  FROM "document_lines" dl
  JOIN "documents" d ON d.id = dl.document_id
  WHERE d.type = 'store_return'
  GROUP BY dl.document_id
)
UPDATE "documents" d
SET subtotal_minor = t.subtotal,
    tax_minor = t.tax
FROM totali t
WHERE t.document_id = d.id;
