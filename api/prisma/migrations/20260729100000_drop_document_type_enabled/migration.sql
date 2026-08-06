-- Via il flag «Abilitato» dei tipi documento: disabilitare un tipo per tenant
-- non serve, le esigenze si gestiscono sul singolo documento. Ogni tipo resta
-- sempre creabile e i documenti esistenti sempre modificabili.
ALTER TABLE "document_type_settings" DROP COLUMN IF EXISTS "enabled";
