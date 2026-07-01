-- Indice per lookup bozze fattura derivate (filtro DDT da fatturare / registro commercialista).

CREATE INDEX "documents_source_document_id_type_status_idx"
  ON "documents"("source_document_id", "type", "status")
  WHERE "source_document_id" IS NOT NULL;
