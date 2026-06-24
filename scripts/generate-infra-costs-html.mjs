import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'docs', 'COSTI-INFRASTRUTTURA-VESTIFLOW.md');
const cssPath = join(root, 'docs', 'guide-print.css');
const htmlPath = join(root, 'docs', 'COSTI-INFRASTRUTTURA-VESTIFLOW.html');

marked.use({ gfm: true });
marked.use(gfmHeadingId());

const css = readFileSync(cssPath, 'utf8');
const md = readFileSync(mdPath, 'utf8');
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VestiFlow — Costi infrastruttura e sicurezza</title>
  <style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;

writeFileSync(htmlPath, html, 'utf8');
console.log(`Generato: ${htmlPath}`);
