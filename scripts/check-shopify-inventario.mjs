#!/usr/bin/env node
/**
 * check:shopify-inventario — nessun percorso Shopify puo' cancellare il catalogo
 * o l'inventario locale.
 *
 * ⛔ **Il difetto che questa guardia impedisce e' costato dei dati.** Il
 *    03/09/2026 un tenant ha perso TUTTE le giacenze e TUTTI i movimenti: 48
 *    righe documento con la spunta magazzino sono rimaste senza il loro effetto,
 *    e i documenti sono rimasti li' a dire che la merce era entrata.
 *
 *    Il percorso era `prepareShopifyLocationForRemoval`: per ogni sede mai
 *    sincronizzata con Shopify cancellava sessioni di conteggio, giacenze e
 *    movimenti — senza filtrare per variante, quindi anche di articoli nati solo
 *    in VestiFlow — e lo faceva PRIMA di verificare se la sede fosse
 *    eliminabile. Non eliminabile significava soltanto che la sede veniva
 *    archiviata: i dati erano gia' persi.
 *
 * ⭐ **La regola che questa guardia difende**, dalle decisioni di prodotto:
 *
 *      Shopify non cancella la storia inventariale di VestiFlow.
 *      Un prodotto gia' collegato non si elimina fisicamente.
 *      La rimozione remota e' uno STATO del collegamento, non una
 *      cancellazione dell'entita' locale.
 *
 * ⚠️ **Non basta togliere la chiamata: bisogna impedire che torni.** Il difetto
 *    era gia' stato corretto una volta — commit 81a9fc45 dell'08/08/2026, che
 *    lo tolse da `disconnect()` — e nonostante quello la stessa pulizia e'
 *    rimasta raggiungibile da `purge()` per un altro mese. Una correzione senza
 *    guardia si riapre da un'altra porta.
 *
 * ⚠️ **Che cosa NON copre.** Questa e' un'analisi statica del testo: vede
 *    `tx.inventoryLevel.deleteMany(...)`, non una cancellazione raggiunta per
 *    riflessione, per SQL costruito a runtime, o attraverso una funzione di un
 *    altro modulo. Per quelle valgono i test, che verificano il comportamento.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROSSO = '[31m';
const GRASSETTO = '[1m';
const FINE = '[0m';

/** Il perimetro: tutto cio' che tratta Shopify lato API. */
const PERIMETRO = path.join('api', 'src', 'shopify');

/**
 * Le entita' che un percorso Shopify non deve mai cancellare.
 *
 * ⚠️ Sono i nomi dei MODELLI Prisma in forma camelCase, cioe' come compaiono
 *    sul client: `tx.inventoryLevel.deleteMany`. Aggiungerne uno qui e' il modo
 *    di estendere la protezione a un'entita' nuova.
 */
const VIETATE = new Set([
  'product',
  'productVariant',
  'inventoryLevel',
  'stockMovement',
  'inventoryCountSession',
  'inventoryCountLine',
  'document',
  'documentLine',
  'supplierOrder',
  'supplierOrderLine',
  /*
    ⛔ **`location` aggiunta il 07/09/2026.** Non e' un'entita' di inventario:
       e' il contenitore che gli da' un luogo. Cancellarla porta via in cascata
       contatori di numerazione, dispositivi fiscali, terminali POS e
       assegnazioni degli utenti, e scollega documenti, ordini e vendite online.

    ⭐ **Nessuna sincronizzazione Shopify elimina una Location, neppure se
       vuota**: l'eliminazione di una sede vuota e non collegata appartiene
       esclusivamente alla funzione VestiFlow dedicata (`docs/24` §1.13.4).

    ⚠️ Erano TRE i `location.delete` nel perimetro — in
       `cleanupUnlinkedImportLocations`, `removeEmptyOnboardingLocation` e
       `cleanupStaleShopifyLocations` — e ognuno si difendeva con «ma prima
       controllo che sia vuota». Il controllo non e' il punto: la decisione non
       spetta a un sync di canale.
  */
  'location',
]);

/**
 * `qualcosa.entita.delete(` oppure `.deleteMany(`.
 *
 * ⚠️ Il gruppo dell'entita' e' preceduto da un punto per non confondere una
 *    `Map` in memoria — `this.pushInFlight.delete(chiave)` — con una
 *    cancellazione di database: li' manca il livello del modello.
 */
const CANCELLAZIONE = /\.\s*([a-zA-Z][a-zA-Z0-9]*)\s*\.\s*(delete|deleteMany)\s*\(/g;

/** SQL grezzo che cancella: `$executeRaw` con DELETE o TRUNCATE. */
const SQL_GREZZO = /\$executeRaw[a-zA-Z]*\s*(\(|`)[^;]{0,200}?\b(DELETE\s+FROM|TRUNCATE)\b/is;

function percorri(dir, dentro = []) {
  if (!fs.existsSync(dir)) return dentro;
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) percorri(p, dentro);
    else if (voce.isFile() && p.endsWith('.ts')) dentro.push(p);
  }
  return dentro;
}

const violazioni = [];
let fileControllati = 0;
let cancellazioniLegittime = 0;

for (const file of percorri(PERIMETRO)) {
  /*
    ⚠️ I test sono esclusi di proposito: un test che PROVA che la cancellazione
       non avviene deve poter nominare la cancellazione, e un mock di Prisma
       espone gli stessi metodi. Il comportamento dei test lo verificano i test.
  */
  if (file.endsWith('.spec.ts')) continue;
  fileControllati += 1;

  const testo = fs.readFileSync(file, 'utf8');
  const righe = testo.split(/\r?\n/);

  righe.forEach((riga, indice) => {
    // Una riga di commento non e' codice: il file conserva apposta la memoria
    // di cio' che cancellava, e quella memoria non deve far fallire il lint.
    const pulita = riga.trim();
    if (pulita.startsWith('//') || pulita.startsWith('*') || pulita.startsWith('/*')) return;

    CANCELLAZIONE.lastIndex = 0;
    let trovato;
    while ((trovato = CANCELLAZIONE.exec(riga)) !== null) {
      const entita = trovato[1];
      if (VIETATE.has(entita)) {
        violazioni.push({
          file,
          riga: indice + 1,
          motivo: `cancella «${entita}», che e' catalogo o inventario locale`,
          testo: pulita.slice(0, 100),
        });
      } else {
        cancellazioniLegittime += 1;
      }
    }
  });

  if (SQL_GREZZO.test(testo)) {
    violazioni.push({
      file,
      riga: 0,
      motivo: 'contiene SQL grezzo con DELETE o TRUNCATE: la guardia non ne legge il bersaglio',
      testo: '$executeRaw ... DELETE/TRUNCATE',
    });
  }
}

if (violazioni.length > 0) {
  console.error(
    `\n${ROSSO}${GRASSETTO}⛔ check:shopify-inventario — un percorso Shopify cancella catalogo o inventario locale.${FINE}\n`,
  );
  for (const v of violazioni) {
    console.error(`   ${v.file}${v.riga ? `:${v.riga}` : ''}`);
    console.error(`     ${v.motivo}`);
    console.error(`     ${v.testo}`);
    console.error('');
  }
  console.error(
    '   Shopify non cancella la storia inventariale di VestiFlow: la rimozione\n' +
      '   remota e uno STATO del collegamento, non una cancellazione dell entita\n' +
      '   locale. Se serve davvero, va deciso prima — non aggiunto qui.\n',
  );
  process.exit(1);
}

console.log(
  `✅ check:shopify-inventario — ${fileControllati} file del perimetro Shopify, nessuna ` +
    `cancellazione di catalogo o inventario locale ` +
    `(${cancellazioniLegittime} cancellazioni su entita non protette, ammesse).`,
);
