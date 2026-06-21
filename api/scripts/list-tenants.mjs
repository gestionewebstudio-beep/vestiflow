import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

try {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      users: {
        orderBy: { createdAt: 'asc' },
        select: { email: true, displayName: true, role: true },
      },
    },
  });

  console.log(`Tenants nel DB: ${tenants.length}`);
  console.log(`Email Admin Vestiflow configurate: ${adminEmails.length}`);

  if (tenants.length === 0) {
    console.log('Nessun tenant trovato.');
  }

  for (const tenant of tenants) {
    const owner = tenant.users[0] ?? null;
    const hiddenFromClientList = tenant.users.some((user) =>
      adminEmails.includes(user.email.trim().toLowerCase()),
    );

    console.log('---');
    console.log(`Nome: ${tenant.name}`);
    console.log(`ID: ${tenant.id}`);
    console.log(`Profilo canale: ${tenant.channelProfile}`);
    console.log(`Creato: ${tenant.createdAt.toISOString()}`);
    console.log(`Primo utente: ${owner?.displayName ?? '—'} <${owner?.email ?? '—'}>`);
    console.log(`Utenti totali: ${tenant.users.length}`);
    console.log(`Visibile in Clienti registrati: ${hiddenFromClientList ? 'NO (Admin Vestiflow)' : 'SI'}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Errore query: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
