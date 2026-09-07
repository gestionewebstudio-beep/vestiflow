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

  ${GRASSETTO}Per applicare le migration che mancano (database di PROVA):${FINE}
    npm run prisma:deploy:test

  ${GRASSETTO}Per scrivere una migration nuova:${FINE}
    1. modifica prisma/schema.prisma
    2. scrivi l'SQL A MANO in
       prisma/migrations/<AAAAMMGGhhmmss>_<nome>/migration.sql,
       con un commento che dica PERCHÉ
    3. npm run prisma:deploy:test   (e verifica su una copia con dati veri)

  ${ROSSO}${GRASSETTO}⛔ NON generare l’SQL con «prisma migrate diff
     --from-schema-datasource»${FINE}: su un database CONDIVISO quel comando
     chiede «quale SQL rende il database identico a questo file?», e tutto ciò
     che sta nel database senza stare nello schema — cioè le tabelle degli
     altri rami — per definizione dello strumento è roba da togliere.
     L'11/08/2026 ha proposto quaranta istruzioni, DROP di cash_sessions,
     fiscal_receipts e pos_terminals comprese.

  ${GRASSETTO}Anche «prisma db push» è vietato:${FINE} allinea il database allo schema
  locale, quindi cancella le tabelle che questo ramo non conosce.

  ⛔ E «npm run prisma:deploy» non esiste più: applicava le migration al
     database CONDIVISO senza dirlo. Vedi README.md → «Database e migration».
`);

process.exit(1);
