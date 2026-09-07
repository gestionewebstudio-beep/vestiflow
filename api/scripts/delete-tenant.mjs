import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

import { confermaBersaglioOEsci } from './bersaglio.mjs';

const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Uso: node scripts/delete-tenant.mjs <tenant-id> [--conferma]');
  process.exit(1);
}

/*
  ⛔ **Ventuno `deleteMany` e una `delete`: qui non si torna indietro.**
     Fino al 07/09/2026 bastava `node scripts/delete-tenant.mjs <id>` per
     cancellare un tenant intero dal database CONDIVISO — `dotenv/config`
     carica `api/.env`, e il bersaglio era quello senza che nessuno lo
     avesse nominato.

  ⭐ La conferma scatta SOLO se il bersaglio non e’ locale: quando
     `DATABASE_URL` puntera’ al database di prova duplicato, smettera’ di
     comparire da sola.
*/
await confermaBersaglioOEsci({
  azione: `elimina il tenant ${tenantId}`,
  url: process.env['DATABASE_URL'],
  argomenti: process.argv.slice(2),
});

const prisma = new PrismaClient();

async function deleteTenantData(prismaClient, id) {
  await prismaClient.inventoryCountLine.deleteMany({ where: { tenantId: id } });
  await prismaClient.inventoryCountSession.deleteMany({ where: { tenantId: id } });
  await prismaClient.supplierOrder.deleteMany({ where: { tenantId: id } });
  await prismaClient.salesOrder.deleteMany({ where: { tenantId: id } });
  await prismaClient.stockMovement.deleteMany({ where: { tenantId: id } });
  await prismaClient.inventoryLevel.deleteMany({ where: { tenantId: id } });
  await prismaClient.productImage.deleteMany({ where: { tenantId: id } });
  await prismaClient.productVariant.deleteMany({ where: { tenantId: id } });
  await prismaClient.product.deleteMany({ where: { tenantId: id } });
  await prismaClient.user.deleteMany({ where: { tenantId: id } });
  await prismaClient.location.deleteMany({ where: { tenantId: id } });
  await prismaClient.store.deleteMany({ where: { tenantId: id } });
  await prismaClient.customer.deleteMany({ where: { tenantId: id } });
  await prismaClient.supplier.deleteMany({ where: { tenantId: id } });
  await prismaClient.shopifyCredential.deleteMany({ where: { tenantId: id } });
  await prismaClient.shopifyOAuthState.deleteMany({ where: { tenantId: id } });
  await prismaClient.shopifyConnection.deleteMany({ where: { tenantId: id } });

  try {
    await prismaClient.tikTokCredential.deleteMany({ where: { tenantId: id } });
    await prismaClient.tikTokOAuthState.deleteMany({ where: { tenantId: id } });
    await prismaClient.tikTokConnection.deleteMany({ where: { tenantId: id } });
  } catch {
    // Migrazione TikTok non applicata su questo DB.
  }

  await prismaClient.tenant.delete({ where: { id } });
}

try {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { users: { select: { email: true, authUserId: true } } },
  });

  if (!tenant) {
    console.error('Tenant non trovato:', tenantId);
    process.exit(1);
  }

  console.log(`Elimino tenant "${tenant.name}" (${tenant.users.map((u) => u.email).join(', ')})`);

  const authUserIds = tenant.users
    .map((user) => user.authUserId)
    .filter((id) => Boolean(id));

  await deleteTenantData(prisma, tenantId);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && authUserIds.length > 0) {
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const authUserId of authUserIds) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) {
        console.warn(`Auth delete fallito ${authUserId}:`, error.message);
      } else {
        console.log(`Auth eliminato: ${authUserId}`);
      }
    }
  }

  console.log('Tenant eliminato.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
