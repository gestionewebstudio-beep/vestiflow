import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/app/features/documents/models/document-table-columns.config.ts';
let t = readFileSync(F, 'utf8');
const eol = t.includes('\r\n') ? '\r\n' : '\n';
const a = `  colonna('reference', {
    label: 'N.',
    headerTooltip: 'Numero interno di catalogazione VestiFlow',
    defaultVisible: true,
  }),`.split('\n').join(eol);
const b = `  colonna('reference', {
    label: 'N.',
    headerTooltip: 'Numero interno di catalogazione VestiFlow',
    defaultVisible: true,
    cardTitle: true,
  }),`.split('\n').join(eol);
if (t.split(a).length - 1 !== 1) { console.error('STOP'); process.exit(1); }
writeFileSync(F, t.replace(a, b), 'utf8');
console.log('  ok  la quinta occorrenza');
