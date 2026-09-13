/**
 * Verifica SUL PROCESSO che l'API del collaudo (3100) lavori su
 * `localhost:5434/vestiflow_collaudo`: conta le connessioni aperte su quel
 * database (sola lettura di `pg_stat_activity`). Un file che dice «5434» non
 * prova niente: lo prova chi è collegato adesso.
 *
 *   node scripts/collaudo-verifica-processo.mjs
 */
import { PrismaClient } from '@prisma/client';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';
import { FILE_AMBIENTE_COLLAUDO, verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
const esito = verificaBersaglioCollaudo(env.DATABASE_URL);
if (!esito.ok) {
  console.error(`Fermo: DATABASE_URL ${esito.motivo}.`);
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
try {
  const righe = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n, max(backend_start)::text AS ultima
       FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()`,
  );
  console.log(
    `connessioni su vestiflow_collaudo (oltre questa): ${righe[0].n} · ultima aperta: ${righe[0].ultima ?? '—'}`,
  );
} finally {
  await prisma.$disconnect();
}
