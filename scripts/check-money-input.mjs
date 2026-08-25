/**
 * Il campo di denaro è **uno solo**: `shared/components/money-input`.
 *
 * ## ⛔ Perché serve una guardia, e non bastava scrivere la primitiva
 *
 * Misurato il 25/08/2026, sui commit:
 *
 * ```text
 * 23/08 18:02  f795763a  nasce `money-input`, «il campo di denaro e' uno solo»
 *                        → ZERO consumatori
 * 24/08 12:35  3373f96d  l'Ordine fornitore entra nella riga condivisa
 *                        → `document-line-row` passa da 1 a 5 input grezzi
 * 24/08 13:35  16b78933  «l'ultima delle sette»: la convergenza si chiude
 *                        → le sette maschere entrano nel sistema comune SENZA il denaro
 * ```
 *
 * ⚠️ **La duplicazione è più NUOVA della primitiva**, ed è stata creata dentro il
 * componente costruito per ospitarla. Non è debito ereditato: è debito prodotto
 * diciotto ore dopo il rimedio, e nessuno se n'è accorto per due giorni.
 *
 * ⭐ **Nessuna delle venti guardie esistenti poteva vederlo.** L'unica che nomina
 * il percorso della cella monetaria è `check-document-grammar.mjs`, che la elenca
 * nel proprio perimetro per cercarvi dentro `if (documentType === …)`: **un file
 * con zero consumatori lo supera per costruzione.** È il caso da manuale della
 * guardia che passa proprio perché non c'è niente da guardare.
 *
 * ## Che cosa controlla
 *
 * Conta gli `inputmode="decimal"` nei template di `src/`, fuori dalla primitiva,
 * e li confronta con l'elenco di deroga qui sotto — **file per file, col numero**.
 * Fallisce se:
 *
 * 1. compare un file **nuovo** che non è in elenco;
 * 2. il conteggio di un file in elenco **cresce**.
 *
 * ⭐ **All'introduzione non cambia niente**: l'elenco è la misura di oggi. Da lì
 * può solo accorciarsi, e un passo che lo accorcia deve aggiornarlo — è la stessa
 * disciplina delle soglie di copertura in `regole-qualita`.
 *
 * ⛔ **Non pretende che la primitiva sia adottata ovunque.** Alcune deroghe sono
 * lavoro dichiarato e separato (`document-line-row` e le due viste a card portano
 * il denaro come stringa già formattata: adottarla lì è un altro lavoro). La
 * guardia impedisce che il numero **peggiori**, non impone che migliori.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** L'ago. È il contratto globale dei campi di denaro (regola del 17/08/2026). */
const AGO = 'inputmode="decimal"';

/** La primitiva: è lei a dichiararlo, ed è l'unico posto dove è giusto. */
const PRIMITIVA = 'src/app/shared/components/money-input/';

/**
 * La misura del 25/08/2026. **Ogni riga è debito dichiarato, non un permesso.**
 *
 * `motivo` dice perché quel file non è ancora passato alla primitiva: dove c'è un
 * ostacolo tecnico vero è nominato, dove non c'è la riga dice «non ancora».
 */
const DEROGHE = [
  {
    file: 'src/app/domain/documents/components/document-line-row/document-line-row.component.html',
    quanti: 5,
    motivo:
      'ostacolo vero: `DocumentLineRowView` trasporta il denaro come STRINGA gia\' formattata, ' +
      'e `costChanged` emette a ogni tasto mentre la primitiva emette allo sfocamento. ' +
      'Adottarla senza risolvere questi due punti salverebbe zero. Lavoro separato, 7 maschere.',
  },
  {
    file: 'src/app/domain/documents/components/document-line-card/document-line-card-body.component.html',
    quanti: 5,
    motivo: 'la veste a card della riga condivisa: stesso ostacolo, stesso lavoro separato.',
  },
  {
    file: 'src/app/domain/documents/components/document-line-card/document-line-card-strip.component.html',
    quanti: 1,
    motivo: 'idem.',
  },
  {
    file: 'src/app/domain/products/components/product-general-step/product-general-step.component.html',
    quanti: 5,
    motivo:
      'anagrafica prodotto: unita\' MAGGIORI, non minori canoniche. Cambia il tipo del dato, ' +
      'non solo il legame. Lavoro separato e ultimo.',
  },
  {
    file: 'src/app/domain/products/components/product-variants-step/product-variants-step.component.html',
    quanti: 3,
    motivo: 'idem.',
  },
  {
    file: 'src/app/features/documents/purchase-invoice-form.component.html',
    quanti: 4,
    motivo:
      'in conversione ADESSO (P3). Nessun ostacolo tecnico: la maschera possiede il proprio form ' +
      'e traccia lo sporco su `form.valueChanges`, non su `control.dirty`.',
  },
  {
    file: 'src/app/features/reports/pages/manual-receipt-form/manual-receipt-form.component.html',
    quanti: 3,
    motivo: 'Corrispettivo manuale: stessa riga economica, stessa conversione, subito dopo.',
  },
  {
    file: 'src/app/features/inventory/movement-form.component.html',
    quanti: 1,
    motivo: 'non ancora.',
  },
  {
    file: 'src/app/features/settings/pages/company/company-page.component.html',
    quanti: 1,
    motivo: 'capitale sociale: valore facoltativo, serve il `null` della primitiva (P2).',
  },
  {
    file: 'src/app/domain/documents/components/document-scan-overlay/document-scan-overlay.component.html',
    quanti: 1,
    motivo: 'non ancora.',
  },
];

const attesi = new Map(DEROGHE.map((d) => [d.file, d]));

function templateDiSrc() {
  const uscita = execFileSync('git', ['ls-files', 'src/**/*.html'], { encoding: 'utf8' });
  return uscita.split(/\r?\n/).filter(Boolean);
}

const violazioni = [];
const trovati = new Map();

for (const file of templateDiSrc()) {
  if (file.startsWith(PRIMITIVA)) continue;
  const testo = readFileSync(file, 'utf8');
  const quanti = testo.split(AGO).length - 1;
  if (quanti === 0) continue;
  trovati.set(file, quanti);

  const atteso = attesi.get(file);
  if (!atteso) {
    violazioni.push({
      file,
      problema: `${quanti} campo/i di denaro scritti a mano in un file NUOVO`,
      rimedio: 'usa `app-money-input`. Se non basta, estendi la primitiva — non ricopiarla.',
    });
    continue;
  }
  if (quanti > atteso.quanti) {
    violazioni.push({
      file,
      problema: `erano ${atteso.quanti}, ora sono ${quanti}`,
      rimedio: 'l\'elenco di deroga puo\' solo ACCORCIARSI. Usa `app-money-input` per i nuovi.',
    });
  }
}

/** Una deroga che non serve più va tolta, o l'elenco smette di dire il vero. */
const scadute = DEROGHE.filter((d) => !trovati.has(d.file) || trovati.get(d.file) < d.quanti).map(
  (d) => ({
    file: d.file,
    quanti: trovati.get(d.file) ?? 0,
    attesi: d.quanti,
  }),
);

if (violazioni.length === 0 && scadute.length === 0) {
  const totale = [...trovati.values()].reduce((n, q) => n + q, 0);
  console.log(
    `✅ check:money-input — nessun campo di denaro nuovo scritto a mano ` +
      `(${totale} in deroga dichiarata, su ${trovati.size} file).`,
  );
  process.exit(0);
}

if (scadute.length > 0) {
  console.error('\n⭐ Una deroga e\' rientrata: aggiorna l\'elenco in scripts/check-money-input.mjs\n');
  for (const s of scadute) {
    console.error(
      `   ${s.file}\n     dichiarati ${s.attesi}, ora ${s.quanti} — ` +
        (s.quanti === 0 ? 'togli la riga.' : `porta \`quanti\` a ${s.quanti}.`),
    );
  }
  console.error('');
}

if (violazioni.length > 0) {
  console.error('\n⛔ Campi di denaro scritti a mano dove la primitiva esiste gia\'.\n');
  console.error('   La primitiva `shared/components/money-input` e\' nata il 23/08/2026 con');
  console.error('   ZERO consumatori, e diciotto ore dopo la riga condivisa e\' passata da 1 a');
  console.error('   5 input grezzi — dentro il componente costruito per ospitarla. Questa');
  console.error('   guardia esiste perche\' quello non si ripeta.\n');
  for (const v of violazioni) {
    console.error(`   ${v.file}\n     ${v.problema}\n     → ${v.rimedio}`);
  }
  console.error('');
}

process.exit(1);
