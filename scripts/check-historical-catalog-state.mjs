#!/usr/bin/env node
/**
 * ⛔ **I CONTESTI STORICI E INVENTARIALI NON FILTRANO SULLO STATO CORRENTE DI
 * PRODOTTO E VARIANTE** (docs/24 §6.1, guardia prevista da §6.2).
 *
 * Un documento di marzo, un movimento di aprile, una giacenza di oggi parlano
 * di ciò che C'È e di ciò che È SUCCESSO: se il prodotto adesso è Non attivo o
 * nel cestino, la sua merce sta ancora in magazzino e le sue righe restano. Un
 * `where` che escludesse `archived`, `inactive` o `deletedAt` da questi moduli
 * farebbe sparire fatturato, giacenze e totali già chiusi — senza errore,
 * senza test rosso, e senza che nulla lo dica a chi guarda.
 *
 * Che cosa cerca, riga per riga, nei moduli di `MODULI`:
 *
 *   - `lifecycleStatus`            esiste solo sulla variante: sempre sospetto
 *   - `ProductStatus.`             l'enum dello stato prodotto in un filtro
 *   - `deletedAt` + `product`/`variant` sulla STESSA riga
 *
 * ⚠️ `deletedAt` da solo NON basta: Codici IVA e tipi documento esterni hanno
 *    la propria colonna omonima e la filtrano legittimamente in ~18 punti.
 *    Misurato prima di scrivere la regex — una guardia più larga sarebbe stata
 *    zittita il giorno stesso.
 *
 * ⛔ **NON esiste un marcatore di eccezione, ed è una decisione.** La prima
 *    stesura (Tranche 1B) ammetteva `// stato-corrente: <motivo>` sulla riga.
 *    L'unica eccezione mai scritta con quel marcatore era il filtro della
 *    Situazione magazzino che escludeva i prodotti Non attivi: un comportamento
 *    **contrario** a §6.1, che il marcatore ha reso legittimo invece di farlo
 *    correggere. Una valvola che nobilita il difetto che la guardia esiste per
 *    trovare non è una valvola: è la disattivazione della guardia, scritta più
 *    piano. Se un caso genuino comparirà, si decide allora — e la decisione si
 *    scrive in docs/24, non in un commento di riga.
 */
import { readFileSync, globSync } from 'node:fs';

/**
 * Moduli che parlano del passato o della realtà inventariale corrente: gli uni
 * e gli altri esistono indipendentemente dallo stato del catalogo di oggi.
 */
const MODULI = [
  'documents',
  'inventory',
  'corrispettivi',
  'analytics',
  'dashboard',
  'store-sales',
  'online-sales',
  'sales-orders',
  'supplier-orders',
  'manual-receipts',
  'order-reservations',
];

const SOSPETTI = [
  { cerca: /\blifecycleStatus\b/, nome: 'lifecycleStatus (stato locale della variante)' },
  { cerca: /\bProductStatus\s*\./, nome: 'ProductStatus.* (stato prodotto)' },
  {
    cerca:
      /\bdeletedAt\b.*\b(product|variant|productVariant)\b|\b(product|variant|productVariant)\b.*\bdeletedAt\b/,
    nome: 'deletedAt di prodotto/variante (cestino)',
  },
];

const file = MODULI.flatMap((m) => globSync(`api/src/${m}/**/*.ts`)).filter(
  (f) => !f.endsWith('.spec.ts') && !f.endsWith('.integration-spec.ts'),
);

if (file.length === 0) {
  console.error('⛔ nessun sorgente esaminato: la guardia sarebbe cieca.');
  process.exit(1);
}

const problemi = [];

for (const percorso of file) {
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  let dentroCommento = false;
  righe.forEach((riga, i) => {
    const eraDentro = dentroCommento;
    if (!dentroCommento && /\/\*/.test(riga) && !/\*\//.test(riga)) dentroCommento = true;
    else if (dentroCommento && /\*\//.test(riga)) dentroCommento = false;
    // I commenti che spiegano la regola la nominano: non sono filtri.
    if (eraDentro || dentroCommento || /^\s*(\/\/|\*|\/\*)/.test(riga)) return;
    // Un import porta il nome dell'enum senza filtrare nulla.
    if (/^\s*import\b/.test(riga)) return;
    for (const s of SOSPETTI) {
      if (!s.cerca.test(riga)) continue;
      problemi.push(
        `⛔ ${percorso.replace(/\\/g, '/')}:${i + 1} · ${s.nome} in un modulo storico/inventariale.\n` +
          `   Questi contesti non filtrano sullo stato di OGGI (docs/24 §6.1):\n` +
          `   lo stato si MOSTRA con un badge, non fa sparire la riga.`,
      );
    }
  });
}

if (problemi.length > 0) {
  console.error(problemi.join('\n\n'));
  process.exit(1);
}

console.log(
  `✅ stato catalogo storico: ${file.length} sorgenti in ${MODULI.length} moduli, ` +
    `nessun filtro sullo stato corrente (e nessuna eccezione ammessa).`,
);
