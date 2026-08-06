/**
 * Genera PDF del piano di test da HTML di stampa.
 * Richiede Google Chrome o Microsoft Edge installati.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const browser = chromeCandidates.find((path) => existsSync(path));

if (!browser) {
  console.error(
    'Browser Chromium non trovato. Imposta CHROME_PATH o installa Chrome/Edge, oppure stampa in PDF da docs/PIANO-TEST-VESTIFLOW.html.',
  );
  process.exit(1);
}

const htmlPath = resolve(root, 'docs', 'PIANO-TEST-VESTIFLOW.html');
const pdfPath = resolve(root, 'docs', 'PIANO-TEST-VESTIFLOW.pdf');

if (!existsSync(htmlPath)) {
  console.error(`Manca ${htmlPath}. Esegui prima: npm run docs:test-plan`);
  process.exit(1);
}

const fileUrl = `file:///${resolve(htmlPath).replace(/\\/g, '/')}`;
const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--print-to-pdf-no-header',
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Generato: ${pdfPath}`);
