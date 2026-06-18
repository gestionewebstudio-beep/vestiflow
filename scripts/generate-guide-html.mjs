import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userMdPath = join(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.md');
const operatorMdPath = join(root, 'docs', 'GUIDA-OPERATORE-VESTIFLOW.md');
const cssPath = join(root, 'docs', 'guide-print.css');
const userPdfHtmlPath = join(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.html');
const technicalPdfHtmlPath = join(root, 'docs', 'GUIDA-TECNICA-VESTIFLOW.html');
const inAppDir = join(root, 'public', 'guide');
const inAppHtmlPath = join(inAppDir, 'content.html');
const adminAssetsDir = join(root, 'src', 'assets', 'guide-admin');
const adminHtmlPath = join(adminAssetsDir, 'content-tecnica.html');

marked.use({ gfm: true });
marked.use(gfmHeadingId());

const css = readFileSync(cssPath, 'utf8');
const userMd = readFileSync(userMdPath, 'utf8');
const operatorMd = readFileSync(operatorMdPath, 'utf8');

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}

const userBody = marked.parse(userMd);
const technicalBody = marked.parse(operatorMd);

writeFileSync(userPdfHtmlPath, wrapHtml('VestiFlow — Guida utente', userBody), 'utf8');
console.log(`Generato: ${userPdfHtmlPath}`);

writeFileSync(
  technicalPdfHtmlPath,
  wrapHtml('VestiFlow — Guida tecnica (operatore)', technicalBody),
  'utf8',
);
console.log(`Generato: ${technicalPdfHtmlPath}`);

mkdirSync(inAppDir, { recursive: true });
writeFileSync(inAppHtmlPath, userBody, 'utf8');
console.log(`Generato: ${inAppHtmlPath}`);

mkdirSync(adminAssetsDir, { recursive: true });
writeFileSync(adminHtmlPath, technicalBody, 'utf8');
console.log(`Generato: ${adminHtmlPath}`);
