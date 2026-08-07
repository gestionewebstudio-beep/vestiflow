/**
 * Guardia sui comandi Prisma distruttivi.
 *
 * Il database di VestiFlow è CONDIVISO e la sua storia delle migration non
 * coincide sempre con quella del ramo su cui si sta lavorando: chi lavora su un
 * altro ramo applica le proprie migration allo stesso database. Con le storie
 * divergenti `prisma migrate dev` non applica e basta — propone di AZZERARE il
 * database per riallinearlo, e `prisma db push` gli cancella le tabelle che il
 * ramo corrente non conosce.
 *
 * Sono i due comandi che si digitano per riflesso. Questo script prende il posto
 * dello script npm che li lanciava, e dice cosa fare invece.
 */
const ROSSO = '[31m';
const GRASSETTO = '[1m';
const FINE = '[0m';

console.error(`
${ROSSO}${GRASSETTO}  Fermo: su questo progetto «prisma migrate dev» non si lancia.${FINE}

  Il database è condiviso e la sua storia delle migration può essere più avanti
  di questo ramo. Con le storie divergenti Prisma propone di AZZERARE il
  database: si perderebbe il lavoro di chi sta su un altro ramo, e i dati.

  ${GRASSETTO}Per applicare le migration che mancano:${FINE}
    npm run prisma:deploy

  ${GRASSETTO}Per scrivere una migration nuova:${FINE}
    1. modifica prisma/schema.prisma
    2. genera l'SQL senza toccare il database:
       npx prisma migrate diff \\
         --from-schema-datasource prisma/schema.prisma \\
         --to-schema-datamodel prisma/schema.prisma --script
    3. metti l'SQL in prisma/migrations/<AAAAMMGGhhmmss>_<nome>/migration.sql
       con un commento che dica PERCHÉ
    4. npm run prisma:deploy

  ${GRASSETTO}Anche «prisma db push» è vietato:${FINE} allinea il database allo schema
  locale, quindi cancella le tabelle che questo ramo non conosce.

  Vedi README.md → «Database e migration».
`);

process.exit(1);
