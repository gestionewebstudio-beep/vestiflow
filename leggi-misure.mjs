import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));

for (const v of d) {
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  VIEWPORT ${v.larghezza}px`);
  console.log('═'.repeat(58));

  console.log('\nALTEZZE misurate dal browser (px):');
  for (const [k, x] of Object.entries(v.altezze)) {
    console.log(`  ${k.padEnd(40)} ${x === null ? 'assente' : x.toFixed(1)}`);
  }

  console.log('\nSTILI CALCOLATI:');
  for (const [zona, props] of Object.entries(v.calcolati)) {
    if (!props) {
      console.log(`  ${zona}: assente`);
      continue;
    }
    console.log(`  ${zona}`);
    for (const [p, val] of Object.entries(props)) {
      console.log(`      ${p.padEnd(22)} ${val}`);
    }
  }

  console.log(`\nTRABOCCA: ${v.trabocca.length ? '' : 'nessuno ✓'}`);
  for (const t of v.trabocca) {
    console.log(`  ⛔ «${t.testo}» contenuto ${t.contenuto}px in cella ${t.cella}px`);
  }

  console.log(`VA A CAPO (importi): ${v.aCapo.length ? v.aCapo.join(' | ') : 'nessuno ✓'}`);

  console.log(`\nREGIONI CHE SCORRONO: ${v.scorrono.length}`);
  for (const s of v.scorrono) console.log(`  ${s.sel}  ${s.scroll}/${s.client}`);

  console.log('\nCOLORI CALCOLATI:');
  for (const [k, x] of Object.entries(v.colori)) console.log(`  ${k.padEnd(38)} ${x ?? '—'}`);

  console.log('\nPULSANTE «NUOVO»:');
  for (const n of v.nuovo) {
    console.log(`  «${n.testo}»  nel piede: ${n.dentroFoot}   nella testata: ${n.dentroHeader}`);
  }
}
