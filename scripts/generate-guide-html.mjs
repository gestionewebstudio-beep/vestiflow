import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.md');
const cssPath = join(root, 'docs', 'guide-print.css');
const outPath = join(root, 'docs', 'GUIDA-UTENTE-VESTIFLOW.html');

const md = readFileSync(mdPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VestiFlow — Guida completa al gestionale</title>
  <style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;

writeFileSync(outPath, html, 'utf8');
console.log(`Generato: ${outPath}`);
