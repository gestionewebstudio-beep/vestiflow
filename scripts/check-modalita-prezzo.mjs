/**
 * Guardia sulla modalità netto/ivato: due livelli ritirati non devono tornare,
 * e quello che li sostituisce deve restare uno solo.
 *
 * Il 16-17/08/2026 la scelta netto/ivato è passata da quattro livelli a due:
 *
 *   PREZZI  convenzione aziendale → memoria operatore → modalità del documento
 *   COSTI   sempre netti          → (nessuna memoria) → modalità del documento
 *
 * Sono spariti i due in mezzo, e nessuno dei due romperebbe qualcosa tornando:
 *
 *   · `DocumentTypeSetting.pricesIncludeVat` — un default per TIPO documento che
 *     nessun pannello esponeva. Una riga in tutto il database, per
 *     `supplier_order`, con `true`, e diciotto ordini netti a smentirla: era già
 *     irraggiungibile, perché la maschera manda sempre un valore e il ripiego
 *     `??` non scattava mai. Riaggiungerlo compilerebbe e passerebbe i test.
 *   · `UserProductPriceModePreference` — memoria personale nell'anagrafica.
 *     L'anagrafica non è un documento: è una vista, e due colleghi devono
 *     leggere lo stesso listino allo stesso modo.
 *
 * E c'era un terzo difetto, più silenzioso degli altri: la modalità **costo**
 * veniva ricordata dentro `user_document_price_mode_preferences` — la tabella dei
 * **prezzi** — tradotta da un ponte costo↔prezzo. Reggeva solo perché i tipi di
 * acquisto e quelli di vendita non si sovrappongono: il primo tipo buono per
 * entrambe l'avrebbe rotta senza un errore.
 *
 * ⚠️ NON si può guardare la parola `pricesIncludeVat` e basta: è un nome giusto
 * in molti posti. `documents.pricesIncludeVat` e `sales_orders.pricesIncludeVat`
 * DEVONO restare — quella è la modalità persistita del singolo documento, ed è
 * il dato, non un default. La guardia controlla quindi i punti precisi.
 *
 * Se una voce va davvero reintrodotta, si toglie da qui **con la decisione
 * scritta accanto** — non si aggiunge un'eccezione al file che sta controllando.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AREE = ['src/app', 'api/src', 'e2e'];
const ESTENSIONI = new Set(['.ts', '.html', '.scss']);

/** Termini che non devono rientrare nel codice, col perché. */
const VIETATI = [
  {
    termine: 'UserProductPriceModePreference',
    perche:
      "memoria personale netto/ivato nell'anagrafica: ritirata. Il listino segue la convenzione aziendale (TenantFeatureSettings.salesPricesIncludeVat).",
  },
  {
    termine: 'userProductPriceModePreference',
    perche: 'idem, forma client Prisma.',
  },
  {
    termine: 'ProductPriceModePreferenceService',
    perche: 'il servizio della memoria in anagrafica: rimosso col suo modello.',
  },
  {
    termine: 'pricesIncludeVatToCostEntryMode',
    perche:
      'ponte prezzo→costo: serviva solo a infilare una modalità di ACQUISTO nella tabella dei PREZZI. I costi partono sempre netti e non hanno memoria.',
  },
  {
    termine: 'costEntryModeToPricesIncludeVat',
    perche: 'ponte costo→prezzo, stessa decisione.',
  },
  {
    termine: 'setting.pricesIncludeVat',
    perche:
      'default netto/ivato per TIPO documento: ritirato. Al suo posto la convenzione aziendale, che è di tenant e si vede in Impostazioni → Prezzi.',
  },
  {
    termine: 'firstUsePricesIncludeVat',
    perche:
      "la costante «vendita ivato / acquisto netto» scritta nel codice: è diventata l'impostazione aziendale, modificabile dal titolare.",
  },
  {
    termine: 'PRICE_MODE_VAT_INCLUDED_DEFAULT_TYPES',
    perche:
      "vecchio nome dell'elenco: adesso è SALES_PRICE_MODE_TYPES, e non dichiara più un valore ma CHI risponde alla convenzione.",
  },
];

/**
 * Invarianti sullo schema Prisma. Sono la guardia più forte: una struttura
 * ritirata rientra da lì prima che dal codice.
 */
function controllaSchema() {
  const schema = readFileSync(join(root, 'api/prisma/schema.prisma'), 'utf8');
  const errori = [];

  const blocco = schema.match(/model DocumentTypeSetting \{[^}]*\}/s);
  if (!blocco) {
    errori.push('model DocumentTypeSetting non trovato: la guardia non sa più cosa controllare.');
  } else if (blocco[0].includes('pricesIncludeVat')) {
    errori.push(
      'DocumentTypeSetting.pricesIncludeVat è tornato: era un default per TIPO documento che nessuno poteva impostare. La convenzione è di TENANT.',
    );
  }

  if (/model UserProductPriceModePreference\b/.test(schema)) {
    errori.push(
      "UserProductPriceModePreference è tornato: l'anagrafica è una vista, non un documento, e segue la convenzione aziendale.",
    );
  }

  // Positiva: ciò che li sostituisce deve esserci, o la gerarchia non ha base.
  if (!/salesPricesIncludeVat\s+Boolean/.test(schema)) {
    errori.push(
      'TenantFeatureSettings.salesPricesIncludeVat non c’è: senza, i documenti nuovi non hanno una convenzione da cui partire.',
    );
  }

  // Positiva: la modalità del singolo documento NON è in discussione.
  for (const [modello, campo] of [
    ['Document', 'pricesIncludeVat'],
    ['SalesOrder', 'pricesIncludeVat'],
  ]) {
    const m = schema.match(new RegExp(`model ${modello} \\{[\\s\\S]*?\\n\\}`));
    if (!m || !m[0].includes(campo)) {
      errori.push(
        `${modello}.${campo} è sparito: quella è la modalità PERSISTITA del documento — il dato, non un default. Senza, riaprire un documento non mostra come era stato compilato.`,
      );
    }
  }

  return errori;
}

/**
 * L'elenco dei tipi che rispondono alla convenzione deve essere **uno solo**:
 * la modalità proposta e le memorie da azzerare devono leggere lo stesso, o
 * cambiando l'impostazione si azzererebbe un insieme diverso da quello che
 * l'impostazione governa.
 */
function controllaElencoUnico() {
  const attesi = [
    'api/src/documents/document-price-mode-preference.service.ts',
    'api/src/tenant/tenant-feature-settings.service.ts',
  ];
  const errori = [];
  for (const rel of attesi) {
    const testo = readFileSync(join(root, rel), 'utf8');
    if (!testo.includes('SALES_PRICE_MODE_TYPES') && !testo.includes('followsSalesPriceMode')) {
      errori.push(
        `${rel} non legge più SALES_PRICE_MODE_TYPES: la modalità proposta e le memorie azzerate devono venire dallo STESSO elenco, o divergono in silenzio.`,
      );
    }
  }
  return errori;
}

const ESENTI = new Set([relative(root, fileURLToPath(import.meta.url)).replaceAll('\\', '/')]);

function* filesIn(dir) {
  let voci;
  try {
    voci = readdirSync(dir);
  } catch {
    return;
  }
  for (const voce of voci) {
    const pieno = join(dir, voce);
    if (statSync(pieno).isDirectory()) {
      yield* filesIn(pieno);
    } else if (ESTENSIONI.has(extname(voce))) {
      yield pieno;
    }
  }
}

const trovati = [];
for (const area of AREE) {
  for (const file of filesIn(join(root, area))) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (ESENTI.has(rel)) continue;
    const righe = readFileSync(file, 'utf8').split(/\r?\n/);
    righe.forEach((riga, i) => {
      for (const { termine, perche } of VIETATI) {
        if (riga.includes(termine)) {
          trovati.push({ rel, riga: i + 1, termine, perche });
        }
      }
    });
  }
}

const erroriSchema = [...controllaSchema(), ...controllaElencoUnico()];

if (trovati.length === 0 && erroriSchema.length === 0) {
  console.log(
    `✓ modalità prezzo: ${VIETATI.length} termini ritirati non sono rientrati, e la convenzione aziendale è al suo posto.`,
  );
  process.exit(0);
}

console.error('\n⛔ modalità netto/ivato: struttura ritirata rientrata.\n');
for (const e of erroriSchema) {
  console.error(`   schema.prisma — ${e}`);
}
for (const { rel, riga, termine, perche } of trovati) {
  console.error(`   ${rel}:${riga}  «${termine}»`);
  console.error(`      ${perche}`);
}
console.error('');
process.exit(1);
