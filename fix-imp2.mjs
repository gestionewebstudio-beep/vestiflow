import { readFileSync, writeFileSync } from 'node:fs';
const F = 'innesta2.mjs';
let t = readFileSync(F, 'utf8');
t = t.replace(
  `const imp = N(\`import type { TableColumnDef } from '@shared/table-columns/table-column.model';\`);`,
  `const imp = N(\`import { colonna } from '@shared/table-columns/column-catalog';\`);`,
);
t = t.replace(
  `  N(\`import type { TableColumnDef } from '@shared/table-columns/table-column.model';

import { conColonneCondivise } from './document-shared-columns';\`),`,
  `  N(\`import { colonna } from '@shared/table-columns/column-catalog';\`) +
    N(\`\nimport { conColonneCondivise } from './document-shared-columns';\`),`,
);
writeFileSync(F, t, 'utf8');
console.log('ok');
