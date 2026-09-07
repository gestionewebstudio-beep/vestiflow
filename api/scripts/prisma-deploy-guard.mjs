/**
 * Guardia su `npm run prisma:deploy`.
 *
 * ⛔ **Non è un comando locale ordinario, ed è stato presentato come tale.**
 *    Fino al 07/09/2026 questo script npm eseguiva `prisma migrate deploy`
 *    senza dire dove: la CLI carica `api/.env` da sé, quindi il bersaglio era
 *    il database CONDIVISO col collega. README, `prisma-migrate-guard.mjs` e
 *    `api/README.md` lo indicavano tutti e tre come «il comando per applicare
 *    le migration» — cioè come qualcosa da digitare senza pensarci.
 *
 * ⭐ **Il deploy automatico locale è UNO SOLO**, e punta al database di prova:
 *    `npm run prisma:deploy:test`, che sostituisce entrambe le variabili nel
 *    processo figlio e verifica host, porta e nome prima di scrivere.
 *
 * ⚠️ **Applicare al condiviso resta possibile, ed è voluto che costi un gesto.**
 *    Le variabili vanno passate esplicitamente, e non stanno più in un file che
 *    qualcuno carica per te.
 */
const ROSSO = '\u001b[31m';
const GRASSETTO = '\u001b[1m';
const FINE = '\u001b[0m';

console.error(`
${ROSSO}${GRASSETTO}  Fermo: «npm run prisma:deploy» non esiste più come comando locale.${FINE}

  Applicava le migration al database CONDIVISO senza dirlo: la CLI Prisma
  legge api/.env da sé, e il bersaglio era quello di sviluppo. Il 07/09/2026
  una migration ci è finita per errore, con un comando che sembrava puntare
  altrove.

  ${GRASSETTO}Per applicare le migration in locale (database di prova):${FINE}
    npm run prisma:deploy:test

  ${GRASSETTO}Per il database condiviso:${FINE} è un'operazione eccezionale, e le
  variabili vanno passate a mano — non stanno più in api/.env:

    DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy

  Prima, però, la migration va provata su una copia: vedi README.md →
  «Database e migration».
`);

process.exit(1);
