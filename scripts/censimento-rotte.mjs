import { globSync, readFileSync } from 'node:fs';

/**
 * ⭐ **Che cosa FA davvero una parola usata come segmento di rotta.**
 *
 * Serve prima di rinominarla, e non è prudenza: è il lavoro. Due volte, il
 * 30/08/2026, una rinomina «ovvia» ha toccato qualcosa che non era una rotta —
 * `quote` è anche un valore di `DocumentType` (rotto in cinque punti), e otto
 * segmenti sono anche chiavi di permesso (`section.sales`).
 *
 * ⛔ **Il criterio non è «quante volte compare»**: è **in quanti RUOLI**. Una
 * parola che fa un mestiere solo si rinomina; una che ne fa due va prima
 * disaccoppiata, o si rompe qualcosa che non compila male — compila benissimo e
 * sbaglia a runtime.
 *
 * ```
 * node scripts/censimento-rotte.mjs            tutti i segmenti, in tabella
 * node scripts/censimento-rotte.mjs sales      un segmento, con le prove
 * ```
 */
const cercato = process.argv[2];

const file = globSync(['src/**/*.{ts,html}', 'e2e/**/*.ts']).map((f) => f.replaceAll('\\', '/'));
const contenuto = new Map(file.map((f) => [f, leggi(f)]));

function leggi(f) {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
}

/** I segmenti dichiarati nelle rotte: è l'insieme da esaminare. */
const segmenti = new Set();
for (const f of file.filter((f) => f.endsWith('.routes.ts'))) {
  for (const m of contenuto.get(f).matchAll(/path:\s*'([^']*)'/g)) {
    for (const s of m[1].split('/')) {
      if (s && !s.startsWith(':') && s !== '**' && s !== 'app') segmenti.add(s);
    }
  }
}

/**
 * I MESTIERI che una parola può fare oltre a essere un pezzo d'indirizzo.
 *
 * ⚠️ Ognuno è un motivo diverso per NON rinominarla alla cieca, e l'ordine è di
 * gravità: il primo cambia dati, l'ultimo cambia solo un'etichetta interna.
 */
const MESTIERI = [
  {
    nome: 'valore di enum o costante',
    /*
      ⛔ **La dichiarazione della rotta va esclusa**, ed è l'errore della prima
      stesura: `path: 'arrivi-merce'` corrispondeva al proprio rilevatore, e il
      censimento dichiarava «sporchi» 44 segmenti su 50. Un rilevatore che accusa
      tutti non distingue niente — ed è il secondo controllo mio, oggi, che
      contava troppo.
    */
    prova: (s) => new RegExp(`\\b(?!path\\b)[A-Za-z]+:\\s*'${s}'`),
    saltaRotte: true,
    gravita: '⛔ tocca i dati',
  },
  {
    nome: 'chiave di permesso',
    prova: (s) => new RegExp(`['"\`][a-z.]*\\.${s}['"\`]|['"\`]${s}\\.[a-z.]+['"\`]`),
    gravita: '⛔ tocca i permessi',
  },
  {
    nome: 'membro di unione di tipi',
    prova: (s) => new RegExp(`\\|\\s*'${s}'|'${s}'\\s*\\|`),
    gravita: '⚠️ tocca i tipi',
  },
  {
    nome: 'chiave di vista salvata',
    prova: (s) => new RegExp(`['"\`]${s}_[a-z_]+['"\`]|['"\`][a-z_]+_${s}['"\`]`),
    gravita: '⚠️ tocca le preferenze',
  },
  {
    nome: 'percorso API',
    prova: (s) => new RegExp(`/api/[a-z0-9/-]*${s}|apiUrl[^\\n]*${s}`),
    gravita: '⛔ tocca il backend',
  },
];

function mestieriDi(seg) {
  const trovati = [];
  for (const m of MESTIERI) {
    const re = m.prova(seg);
    const prove = [];
    for (const [f, testo] of contenuto) {
      if (f.endsWith('.spec.ts')) continue;
      if (m.saltaRotte && f.endsWith('.routes.ts')) continue;
      if (!testo.includes(seg)) continue;
      for (const riga of testo.split(/\r?\n/)) {
        if (re.test(riga) && !/^\s*(\/\/|\*)/.test(riga)) {
          prove.push(`${f}: ${riga.trim().slice(0, 88)}`);
          break;
        }
      }
      if (prove.length >= 3) break;
    }
    if (prove.length > 0) trovati.push({ ...m, prove });
  }
  return trovati;
}

if (cercato) {
  const m = mestieriDi(cercato);
  console.log(`\n══ «${cercato}» ══\n`);
  if (m.length === 0) {
    console.log('  ✅ fa SOLO il segmento di rotta: si può rinominare.\n');
  } else {
    for (const { nome, gravita, prove } of m) {
      console.log(`  ${gravita}  ${nome}`);
      for (const p of prove) console.log(`      ${p}`);
      console.log('');
    }
  }
} else {
  const puliti = [];
  const sporchi = [];
  for (const s of [...segmenti].sort()) {
    const m = mestieriDi(s);
    if (m.length === 0) puliti.push(s);
    else sporchi.push([s, m.map((x) => x.nome).join(' + ')]);
  }
  console.log(`\n✅ SOLO ROTTA — rinominabili (${puliti.length})\n   ${puliti.join(' · ')}\n`);
  console.log(`⛔ FANNO ALTRI MESTIERI — da disaccoppiare prima (${sporchi.length})\n`);
  for (const [s, m] of sporchi) console.log(`   ${s.padEnd(32)} ${m}`);
  console.log('');
}
