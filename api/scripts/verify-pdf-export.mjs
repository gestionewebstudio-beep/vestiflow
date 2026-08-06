import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const prisma = new PrismaClient();

const OUTPUT_DIR = join(process.cwd(), 'tmp', 'pdf-verify');

function monthRangeIso() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    placedFrom: from.toISOString().slice(0, 10),
    placedTo: to.toISOString().slice(0, 10),
  };
}

function assertPdfBuffer(buffer, label) {
  const magic = buffer.subarray(0, 4).toString();
  if (magic !== '%PDF') {
    throw new Error(`${label}: buffer non è un PDF valido (magic=${magic})`);
  }
  if (buffer.length < 512) {
    throw new Error(`${label}: PDF troppo piccolo (${buffer.length} bytes)`);
  }
}

async function findPrintableDocument() {
  const preferred = await prisma.document.findFirst({
    where: {
      type: 'sales_ddt',
      status: { in: ['confirmed', 'printed', 'sent'] },
      reference: { not: null },
    },
    orderBy: { documentDate: 'desc' },
    select: { id: true, tenantId: true, reference: true, type: true, status: true },
  });
  if (preferred) {
    return preferred;
  }

  return prisma.document.findFirst({
    where: {
      type: {
        in: [
          'sales_ddt',
          'proforma',
          'invoice_draft',
          'transfer',
          'goods_receipt',
          'supplier_ddt',
          'supplier_invoice_accompanying',
        ],
      },
    },
    orderBy: { documentDate: 'desc' },
    select: { id: true, tenantId: true, reference: true, type: true, status: true },
  });
}

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { DocumentsService } = require('../dist/documents/documents.service');
  const { DocumentPdfService } = require('../dist/documents/document-pdf.service');
  const { CorrispettiviExportService } = require('../dist/corrispettivi/corrispettivi-export.service');

  const docRow = await findPrintableDocument();
  if (!docRow) {
    throw new Error('Nessun documento stampabile trovato nel DB. Crea/conferma un DDT vendita e riprova.');
  }

  const period = monthRangeIso();
  const corrispettiviTenant = docRow.tenantId;

  console.log('Verifica export PDF server-side');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(
    `Documento: ${docRow.reference ?? docRow.id} (${docRow.type}, ${docRow.status}, tenant ${docRow.tenantId})`,
  );
  console.log(`Corrispettivi: tenant ${corrispettiviTenant}, periodo ${period.placedFrom} → ${period.placedTo}`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const documents = app.get(DocumentsService);
    const documentPdf = app.get(DocumentPdfService);
    const corrispettiviExport = app.get(CorrispettiviExportService);

    const detail = await documents.getById(docRow.tenantId, docRow.id);
    const documentExport = await documentPdf.exportPdf(docRow.tenantId, detail);
    assertPdfBuffer(documentExport.buffer, 'Documento');

    const documentPath = join(OUTPUT_DIR, documentExport.filename);
    await writeFile(documentPath, documentExport.buffer);

    const corrispettiviExportResult = await corrispettiviExport.exportAccountantPdf(
      corrispettiviTenant,
      {
        page: 1,
        pageSize: 25,
        placedFrom: period.placedFrom,
        placedTo: period.placedTo,
      },
    );
    assertPdfBuffer(corrispettiviExportResult.buffer, 'Corrispettivi');
    const corrispettiviPath = join(OUTPUT_DIR, corrispettiviExportResult.filename);
    await writeFile(corrispettiviPath, corrispettiviExportResult.buffer);

    console.log('\nOK — PDF generati:');
    console.log(`  • Documento: ${documentPath} (${documentExport.buffer.length} bytes)`);
    console.log(`  • Corrispettivi: ${corrispettiviPath} (${corrispettiviExportResult.buffer.length} bytes)`);
    console.log('\nApri i file per controllare layout e nomi.');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nVerifica PDF fallita:', error instanceof Error ? error.message : error);
  void prisma.$disconnect();
  process.exit(1);
});
