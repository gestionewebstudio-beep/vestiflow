import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.md');
const cssPath = join(root, 'docs', 'guide-print.css');
const pdfHtmlPath = join(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.html');
const inAppDir = join(root, 'public', 'guide');
const inAppHtmlPath = join(inAppDir, 'content.html');

const EXCLUDE_IN_APP =
  /<!-- vestiflow:exclude-in-app -->[\s\S]*?<!-- \/vestiflow:exclude-in-app -->/g;

function stripInAppOnlyBlocks(markdown) {
  return markdown.replace(EXCLUDE_IN_APP, '').replace(/\n{3,}/g, '\n\n').trim();
}

marked.use({ gfm: true });
marked.use(gfmHeadingId());

const md = readFileSync(mdPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const pdfBody = marked.parse(md);
const inAppBody = marked.parse(stripInAppOnlyBlocks(md));

const pdfHtml = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VestiFlow — Guida completa al gestionale</title>
  <style>${css}</style>
</head>
<body>
${pdfBody}
</body>
</html>`;

writeFileSync(pdfHtmlPath, pdfHtml, 'utf8');
console.log(`Generato: ${pdfHtmlPath}`);

mkdirSync(inAppDir, { recursive: true });
writeFileSync(inAppHtmlPath, inAppBody, 'utf8');
console.log(`Generato: ${inAppHtmlPath}`);
