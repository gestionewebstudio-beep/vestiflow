import type { PrismaClient } from '@prisma/client';

import { ambienteIntegrazione } from './env';

/**
 * Dataset del Passo 6A: il minimo che serve a creare ordini veri via API.
 *
 * ⭐ Un solo tenant, una sola sede, un titolare: qui non si prova
 *    l'autorizzazione — quella ha la sua suite — si provano gli **stati**.
 */
export const IDS_STATI = {
  tenant: '0e000000-0000-4000-8000-00000000000e',
  sede: '1e000000-0000-4000-8000-00000000e001',
  utente: '2e000000-0000-4000-8000-00000000e101',
  authOwner: '3e000000-0000-4000-8000-00000000e201',
  parteCliente: '4e000000-0000-4000-8000-00000000e301',
  cliente: '4e000000-0000-4000-8000-00000000e302',
  parteFornitore: '4e000000-0000-4000-8000-00000000e303',
  fornitore: '4e000000-0000-4000-8000-00000000e304',
  prodotto: '5e000000-0000-4000-8000-00000000e401',
  variante: '5e000000-0000-4000-8000-00000000e402',
  /** Un secondo articolo: serve a sostituire quello di una riga esistente. */
  varianteB: '5e000000-0000-4000-8000-00000000e403',
  /** Un ordine di canale: deve restare con `commercialState` a NULL. */
  ordineCanale: '6e000000-0000-4000-8000-00000000e501',
} as const;

function assertBersaglio(): void {
  const a = ambienteIntegrazione();
  if (a.host !== 'localhost:5433' || a.database !== 'vestiflow_test') {
    throw new Error(`⛔ rifiutato: ${a.host}/${a.database} non è il database di prova.`);
  }
}

export async function creaDatasetStati(prisma: PrismaClient): Promise<void> {
  // ⛔ La barriera si ri-verifica prima del TRUNCATE.
  assertBersaglio();

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "stock_reservations", "stock_movements", "inventory_levels", ' +
      '"supplier_order_lines", "supplier_orders", "sales_order_lines", "sales_orders", ' +
      '"document_lines", "documents", "product_variants", "products", "customers", ' +
      '"suppliers", "parties", "user_locations", "users", "locations", "document_counters", ' +
      '"tenants" RESTART IDENTITY CASCADE',
  );

  const T = IDS_STATI;
  const sql = (s: string) => prisma.$executeRawUnsafe(s);

  await sql(`INSERT INTO tenants (id,name,created_at,updated_at)
             VALUES ('${T.tenant}','Tenant stati',now(),now())`);
  await sql(`INSERT INTO locations (id,tenant_id,name,licensed_in_vf,created_at,updated_at)
             VALUES ('${T.sede}','${T.tenant}','Sede stati',true,now(),now())`);

  // Titolare: qui l'autorizzazione non è l'oggetto della prova.
  await sql(`INSERT INTO users (id,tenant_id,auth_user_id,email,display_name,role,is_active,
                                has_all_locations_access,permissions,created_at,updated_at)
             VALUES ('${T.utente}','${T.tenant}','${T.authOwner}','titolare@stati.local',
                     'Titolare stati','owner',true,true,'{}',now(),now())`);

  await sql(`INSERT INTO parties (id,tenant_id,company_name,created_at,updated_at) VALUES
             ('${T.parteCliente}','${T.tenant}','Cliente stati',now(),now()),
             ('${T.parteFornitore}','${T.tenant}','Fornitore stati',now(),now())`);
  await sql(`INSERT INTO customers (id,tenant_id,party_id,created_at,updated_at)
             VALUES ('${T.cliente}','${T.tenant}','${T.parteCliente}',now(),now())`);
  await sql(`INSERT INTO suppliers (id,tenant_id,party_id,created_at,updated_at)
             VALUES ('${T.fornitore}','${T.tenant}','${T.parteFornitore}',now(),now())`);

  await sql(`INSERT INTO products (id,tenant_id,name,article_code,created_at,updated_at)
             VALUES ('${T.prodotto}','${T.tenant}','Articolo stati','ART-STATI',now(),now())`);
  await sql(`INSERT INTO product_variants (id,tenant_id,product_id,sku,selling_price_minor,
                                           created_at,updated_at)
             VALUES ('${T.variante}','${T.tenant}','${T.prodotto}','SKU-STATI',1990,now(),now()),
                    ('${T.varianteB}','${T.tenant}','${T.prodotto}','SKU-STATI-B',2990,now(),now())`);

  // Giacenza sufficiente: gli impegni devono poter nascere.
  await sql(`INSERT INTO inventory_levels (id,tenant_id,variant_id,location_id,on_hand,available,committed,
                                           updated_at)
             VALUES (gen_random_uuid(),'${T.tenant}','${T.variante}','${T.sede}',100,100,0,now())`);

  // ⭐ Un ordine di canale, che deve restare fuori dal ciclo commerciale.
  await sql(`INSERT INTO sales_orders (id,tenant_id,order_number,customer_name,placed_at,source,
                                       fulfillment_status,created_at,updated_at)
             VALUES ('${T.ordineCanale}','${T.tenant}','#1001','Cliente Shopify','2026-08-01',
                     'shopify_online','fulfilled',now(),now())`);
}
