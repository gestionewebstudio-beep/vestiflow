-- Specifica cliente (correzione audit anagrafica articoli): lo SKU della
-- variante e' un codice operativo/commerciale facoltativo alla creazione,
-- MAI generato casualmente e MAI richiesto per poter salvare un articolo.
-- L'unicita' resta garantita a livello applicativo + dal vincolo unico
-- esistente (tenant_id, sku): in Postgres piu' righe con sku NULL sono
-- ammesse dal vincolo UNIQUE (NULL e' sempre "distinto"), quindi rendere la
-- colonna nullable non richiede toccare l'indice "product_variants_tenant_id_sku_key".
ALTER TABLE "product_variants"
  ALTER COLUMN "sku" DROP NOT NULL;
