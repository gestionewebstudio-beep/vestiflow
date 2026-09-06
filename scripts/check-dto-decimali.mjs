/**
 * ⛔ **`@IsInt()` su una colonna decimale è un 400 che nessuno vede.**
 *
 * Misurato il 26/08/2026: SETTE difetti della stessa famiglia in una sola
 * sessione. Un DTO dichiara `@IsInt()` su un campo la cui colonna è
 * `numeric(n, m)`, il client manda il valore con la coda decimale — che il
 * contratto del denaro PRESCRIVE (`regole-gestionale`: «un prezzo digitato
 * ivato vale 2049,180328 centesimi netti») — e il `ValidationPipe` globale
 * risponde **400 col messaggio generico**, senza dire quale campo.
 *
 * ⚠️ **Nessuna rete lo prende, e la ragione è strutturale:**
 * - TypeScript compila: `number` accetta i decimali;
 * - ESLint tace: il decoratore è sintatticamente perfetto;
 * - i test del service lo chiamano DIRETTAMENTE, senza passare dalla pipe;
 * - `api/vitest.config.ts` esclude `src/**\/dto/**` dalla copertura.
 *
 * ⭐ Questa guardia confronta le due dichiarazioni che devono concordare: il
 * decoratore nel DTO e la scala della colonna nello `schema.prisma`.
 *
 * ⛔ **Il contrario è altrettanto un difetto, e va detto**: `@IsNumber` su una
 * colonna `Int` lascia entrare un non-intero che il database poi rifiuta — o,
 * peggio, tronca. Il 26/08 un sospetto proponeva proprio quello su
 * `netMinor` della Registrazione fattura, che è un TOTALE di riga e finisce
 * in `line_total_minor integer`. Era il rimedio sbagliato.
 *
 * Il criterio è quello di `regole-gestionale`: **prezzi e costi UNITARI sono
 * decimali, totali e imposte sono interi.**
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const schema = readFileSync('api/prisma/schema.prisma', 'utf8');

/** nome del campo Prisma → 'int' | 'decimal', per i soli campi monetari/percentuali. */
const tipoDelCampo = new Map();
for (const riga of schema.split(/\r?\n/)) {
  const m = riga.match(/^\s{2}(\w+)\s+(Int|Decimal)(\?)?\s/);
  if (!m) continue;
  const [, nome, tipo] = m;
  if (!/Minor$|Percent$|Price$|Cost$/i.test(nome)) continue;
  const gia = tipoDelCampo.get(nome);
  const t = tipo === 'Int' ? 'int' : 'decimal';
  // se lo stesso nome compare con due tipi diversi, non si può asserire nulla
  tipoDelCampo.set(nome, gia && gia !== t ? 'misto' : t);
}

const dto = execSync('git ls-files "api/src/**/*.dto.ts"', { encoding: 'utf8' })
  .split('\n')
  .map((r) => r.trim())
  .filter(Boolean);

/**
 * ⚠️ **Nomi che questa guardia NON può giudicare, e perché.**
 *
 * Il confronto è per NOME di campo attraverso tutto lo schema: un DTO che è un
 * oggetto-valore generico non ha un modello proprio, quindi il nome può
 * combaciare con un campo che non c’entra niente.
 *
 * ⛔ Ogni riga è un limite DICHIARATO della guardia, non un permesso: se
 * l’elenco cresce, è la guardia a dover diventare più precisa.
 */
/**
 * ⭐ **Ambiguità RISOLTE: lo stesso nome con due tipi, e quale vale per i DTO.**
 *
 * ⛔ Prima queste venivano saltate in silenzio, ed è il difetto che questo
 * progetto chiama «gate spento»: la guardia usciva verde proprio sul campo dove
 * stavano i difetti veri. Falsificata il 26/08/2026 e trovata cieca.
 */
const RISOLTI = {
  // `unitPriceMinor` è Decimal(16,6) su SalesOrderLine e DocumentLine — cioè
  // ovunque un DTO lo scriva — ed è Int solo su OnlineSaleLine, che rispecchia
  // le vendite Shopify ed è di SOLA LETTURA (`regole-gestionale`, ownership).
  unitPriceMinor: 'decimal',
};

const AMBIGUI = [
  {
    campo: 'netMinor',
    dto: 'api/src/documents/dto/save-purchase-invoice.dto.ts',
    motivo:
      'Un campo di DTO non è sempre una colonna, ed è il limite strutturale di ' +
      'questa guardia. Il `netMinor` della Registrazione fattura è di TRANSPORTO: ' +
      'il servizio lo scrive in `unit_price_minor` (numeric, tiene la coda) e in ' +
      '`line_total_minor` (integer, arrotondato con `roundToMinor`). L’unico ' +
      '`net_minor` INTERO dello schema è di ManualReceiptLine, che nessun DTO ' +
      'dichiara con quel nome — verificato il 26/08/2026: un solo DTO in tutta ' +
      'api/src ha questo campo.',
  },
  {
    campo: 'amountMinor',
    dto: 'api/src/products/dto/money.dto.ts',
    motivo:
      'MoneyDto è un oggetto-valore generico: porta i prezzi del PRODOTTO ' +
      '(sellingPrice, compareAtPrice, purchasePrice), tutti Decimal(16,6). ' +
      'L’unico `amountMinor Int` dello schema appartiene a ' +
      'DocumentPaymentInstallment, che non c’entra. Misurato il 26/08/2026.',
  },
];

const guasti = [];
const ambigui = new Set();

for (const f of dto) {
  let righe;
  try {
    righe = readFileSync(f, 'utf8').split(/\r?\n/);
  } catch {
    continue;
  }
  for (let i = 0; i < righe.length; i++) {
    const campo = righe[i].match(/^\s{2}(?:readonly\s+)?(\w+)[?!]?:\s*number/);
    if (!campo) continue;
    const nome = campo[1];
    const atteso = tipoDelCampo.get(nome);
    const risolto = RISOLTI[nome];
    const effettivo = risolto ?? atteso;
    if (!effettivo) continue;
    if (effettivo === 'misto') {
      ambigui.add(nome);
      continue;
    }
    if (AMBIGUI.some((a) => a.campo === nome && f.endsWith(a.dto.split('/').pop()))) continue;

    // i decoratori del campo: risalgo finché trovo righe che iniziano con @
    let k = i - 1;
    const decoratori = [];
    while (k >= 0 && /^\s*@/.test(righe[k])) {
      decoratori.push(righe[k].trim());
      k--;
    }
    const testo = decoratori.join(' ');
    if (!testo) continue;

    const dichiaraInt = /@IsInt\(\)/.test(testo);
    const dichiaraNum = /@IsNumber\(/.test(testo);

    if (effettivo === 'decimal' && dichiaraInt) {
      guasti.push({ f, riga: i + 1, nome, problema: '`@IsInt()` su una colonna DECIMALE', rimedio: '@IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })' });
    }
    if (effettivo === 'int' && dichiaraNum && !dichiaraInt) {
      guasti.push({ f, riga: i + 1, nome, problema: '`@IsNumber()` su una colonna INTERA', rimedio: '@IsInt() — e arrotonda nel client, dove il valore nasce' });
    }
  }
}

if (guasti.length > 0) {
  console.error('\n⛔ check:dto-decimali — decoratore e colonna non concordano\n');
  for (const g of guasti) {
    console.error(`  ${g.f}:${g.riga}  campo \`${g.nome}\``);
    console.error(`    problema  ${g.problema}`);
    console.error(`    → rimedio ${g.rimedio}\n`);
  }
  console.error('  Il criterio e\u0300 `regole-gestionale`: unitari decimali, totali interi.\n');
  process.exit(1);
}

if (ambigui.size > 0) {
  const elenco = [...ambigui].join(", ");
  console.log(
    "⚠️  " + ambigui.size + " campi NON verificabili (stesso nome, due tipi nello schema): " + elenco,
  );
  console.log(
    "     Dichiarali in RISOLTI con la misura, oppure questa guardia e' cieca proprio li'.",
  );
}
console.log(
  `✅ check:dto-decimali — ${dto.length} DTO, ${tipoDelCampo.size} campi monetari: decoratori e colonne concordano.`,
);
