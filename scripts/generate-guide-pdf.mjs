/**
 * Genera PDF guida utente e guida tecnica (operatore) dall'HTML di stampa.
 * Richiede Google Chrome o Microsoft Edge installati.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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
    'Browser Chromium non trovato. Imposta CHROME_PATH o installa Chrome/Edge, oppure stampa in PDF dagli HTML in docs/.',
  );
  process.exit(1);
}

function printPdf(htmlPath, pdfPath) {
  if (!existsSync(htmlPath)) {
    console.error(`Manca ${htmlPath}. Esegui prima: npm run docs:guide`);
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
      `--print-to-pdf=${resolve(pdfPath)}`,
      fileUrl,
    ],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log(`Generato: ${pdfPath}`);
}

const userHtml = resolve(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.html');
const userPdf = resolve(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.pdf');
const technicalHtml = resolve(root, 'docs', 'GUIDA-TECNICA-VESTIFLOW.html');
const technicalPdf = resolve(root, 'docs', 'GUIDA-TECNICA-VESTIFLOW.pdf');

printPdf(userHtml, userPdf);

const publicUserPdf = resolve(root, 'public', 'guide', 'vestiflow-guida.pdf');
mkdirSync(dirname(publicUserPdf), { recursive: true });
copyFileSync(userPdf, publicUserPdf);
console.log(`Copiato PDF utente in-app: ${publicUserPdf}`);

printPdf(technicalHtml, technicalPdf);

const adminPdf = resolve(root, 'src', 'assets', 'guide-admin', 'vestiflow-guida-tecnica.pdf');
mkdirSync(dirname(adminPdf), { recursive: true });
copyFileSync(technicalPdf, adminPdf);
console.log(`Copiato PDF guida tecnica admin: ${adminPdf}`);
