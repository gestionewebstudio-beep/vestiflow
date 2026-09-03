#!/usr/bin/env node
/**
 * ⛔ **I CONTESTI STORICI NON FILTRANO SULLO STATO CORRENTE DI PRODOTTO E VARIANTE**
 * (docs/24 §6.1, guardia prevista da §6.2).
 *
 * Un documento di marzo, un movimento di aprile, un report di agosto parlano di
 * ciò che È SUCCESSO: se il prodotto oggi è Non attivo o nel cestino, ieri era
 * in vendita, e quelle righe restano. Un `where` che escludesse `archived`,
 * `inactive` o `deletedAt` da un modulo storico farebbe sparire fatturato,
 * giacenze movimentate e totali già chiusi — senza errore e senza test rosso.
 *
 * Che cosa cerca, riga per riga, nei soli moduli storici (`MODULI`):
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
 * ⭐ **Le eccezioni si NOMINANO sulla riga**, col marcatore
 *    `// stato-corrente: <motivo>`. Non c'è un elenco separato: chi legge il
 *    filtro deve leggere anche perché è ammesso.
 *
 * ⚠️ Questo file si scrive con uno strumento che non passa dalla shell: gli
 *    heredoc di Git Bash mangiano le barre rovesciate e le regex nascono cieche.
 */
import { readFileSync, globSync } from 'node:fs';

/** Moduli che parlano del passato o di ciò che è già stato registrato. */
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

const MARCATORE = /\/\/\s*stato-corrente:\s*\S/;

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
let eccezioni = 0;

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
      if (MARCATORE.test(riga)) {
        eccezioni += 1;
        return;
      }
      problemi.push(
        `⛔ ${percorso.replace(/\\/g, '/')}:${i + 1} · ${s.nome} in un modulo storico.\n` +
          `   Un contesto storico non filtra sullo stato di OGGI (docs/24 §6.1).\n` +
          `   Se è davvero una vista operativa, nominalo: // stato-corrente: <motivo>`,
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
    `nessun filtro sullo stato corrente (${eccezioni} eccezione/i nominate).`,
);
