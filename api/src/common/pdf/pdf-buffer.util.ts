import { PDFDocument, type PdfDocumentInstance } from './pdf-document.types';

export type PdfBuildFn = (doc: PdfDocumentInstance) => void;

/** Genera un buffer PDF A4 da una funzione di layout sincrona. */
export function renderPdfToBuffer(build: PdfBuildFn): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);

    build(doc);
    doc.end();
  });
}

/** Nome file sicuro per Content-Disposition. */
export function sanitizePdfFilename(base: string): string {
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'export';
}
