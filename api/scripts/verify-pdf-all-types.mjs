/**
 * Genera un PDF per OGNI tipo documento stampabile che esiste in archivio.
 *
 * SOLA LETTURA: nessuna scrittura sul database. Prende il documento piu'
 * recente di ciascun tipo e ne produce il foglio, cosi' da poterli aprire tutti
 * e guardare che cosa e' cambiato.
 *
 * Uso:  npm run verify:pdf-all --prefix api
 *
 * Il gemello `verify-pdf-export.mjs` prova UN documento; questo li prova tutti,
 * che e' cio' che serve da quando i tipi stampabili sono quindici invece di
 * sette. L'uscita finisce in `api/tmp/`, che e' gia' ignorata da git.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const prisma = new PrismaClient();

const OUTPUT_DIR = process.argv[2] ?? join(process.cwd(), 'tmp', 'prova-stampa');

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { DocumentsService } = require('../dist/documents/documents.service');
  const { DocumentPdfService } = require('../dist/documents/document-pdf.service');
  const {
    PRINTABLE_DOCUMENT_TYPES,
    documentPrintKind,
    documentPrintShowsValues,
  } = require('../dist/documents/document-print.util');

  await mkdir(OUTPUT_DIR, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const documents = app.get(DocumentsService);
  const pdf = app.get(DocumentPdfService);

  const righe = [];

  for (const type of PRINTABLE_DOCUMENT_TYPES) {
    const row = await prisma.document.findFirst({
      where: { type },
      orderBy: { documentDate: 'desc' },
      select: { id: true, tenantId: true, reference: true },
    });

    if (!row) {
      righe.push([type, '—', 'nessun documento di questo tipo in archivio']);
      continue;
    }

    try {
      const detail = await documents.getById(row.tenantId, row.id);
      const { buffer, filename } = await pdf.exportPdf(row.tenantId, detail);
      const magic = buffer.subarray(0, 4).toString();
      if (magic !== '%PDF') {
        righe.push([type, row.reference ?? row.id, `NON e' un PDF (magic=${magic})`]);
        continue;
      }
      const path = join(OUTPUT_DIR, `${type}__${filename}`);
      await writeFile(path, buffer);
      const valori = documentPrintShowsValues(type) ? 'con prezzi' : 'SENZA prezzi';
      righe.push([
        type,
        row.reference ?? row.id,
        `ok · ${Math.round(buffer.length / 1024)} kB · ${documentPrintKind(type)} · ${valori}`,
      ]);
    } catch (error) {
      righe.push([type, row.reference ?? row.id, `ERRORE: ${error.message}`]);
    }
  }

  await app.close();

  const w0 = Math.max(...righe.map((r) => r[0].length));
  const w1 = Math.max(...righe.map((r) => String(r[1]).length));
  console.log('');
  for (const [type, ref, esito] of righe) {
    console.log(`  ${type.padEnd(w0)}  ${String(ref).padEnd(w1)}  ${esito}`);
  }
  console.log(`\n  PDF generati in: ${OUTPUT_DIR}\n`);

  const rotti = righe.filter((r) => /ERRORE|NON e'/.test(r[2]));
  if (rotti.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
