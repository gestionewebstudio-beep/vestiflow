import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  MAX_ATTACHMENT_FILE_BYTES,
  assertAttachmentQuota,
  assertValidAttachmentFile,
  attachmentDownloadFilename,
  formatMegabytes,
  matchesAttachmentMagicBytes,
  quotaExceededMessage,
  resolveAttachmentMime,
  sanitizeAttachmentFileName,
} from './attachment-rules.util';

const PDF_HEAD = Buffer.from('%PDF-1.7\n...');
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const ZIP_HEAD = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const EXE_HEAD = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

function heicHead(brand = 'heic'): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp'),
    Buffer.from(brand),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('resolveAttachmentMime', () => {
  it('accetta i MIME dei formati previsti', () => {
    expect(resolveAttachmentMime('application/pdf', 'a.pdf')).toBe('application/pdf');
    expect(resolveAttachmentMime('image/jpeg', 'a.jpg')).toBe('image/jpeg');
    expect(resolveAttachmentMime('image/png', 'a.png')).toBe('image/png');
    expect(resolveAttachmentMime(DOCX_MIME, 'a.docx')).toBe(DOCX_MIME);
    expect(resolveAttachmentMime(XLSX_MIME, 'a.xlsx')).toBe(XLSX_MIME);
  });

  // I browser mandano spesso octet-stream per HEIC e per gli Office: senza il
  // fallback sull'estensione l'upload verrebbe rifiutato a torto.
  it('ricade sull’estensione quando il MIME è generico', () => {
    expect(resolveAttachmentMime('application/octet-stream', 'foto.HEIC')).toBe('image/heic');
    expect(resolveAttachmentMime('', 'contratto.docx')).toBe(DOCX_MIME);
    expect(resolveAttachmentMime(undefined, 'listino.xlsx')).toBe(XLSX_MIME);
  });

  it('ignora i parametri del MIME (charset)', () => {
    expect(resolveAttachmentMime('application/pdf; charset=binary', 'a.pdf')).toBe(
      'application/pdf',
    );
  });

  it('rifiuta i formati non previsti', () => {
    expect(resolveAttachmentMime('application/zip', 'archivio.zip')).toBeNull();
    expect(resolveAttachmentMime('video/mp4', 'clip.mp4')).toBeNull();
    expect(resolveAttachmentMime('application/x-msdownload', 'setup.exe')).toBeNull();
    expect(resolveAttachmentMime('text/xml', 'fattura.xml')).toBeNull();
  });
});

describe('matchesAttachmentMagicBytes', () => {
  it('riconosce i contenuti reali dei formati ammessi', () => {
    expect(matchesAttachmentMagicBytes(PDF_HEAD, 'application/pdf')).toBe(true);
    expect(matchesAttachmentMagicBytes(PNG_HEAD, 'image/png')).toBe(true);
    expect(matchesAttachmentMagicBytes(JPEG_HEAD, 'image/jpeg')).toBe(true);
    expect(matchesAttachmentMagicBytes(heicHead(), 'image/heic')).toBe(true);
    expect(matchesAttachmentMagicBytes(ZIP_HEAD, DOCX_MIME)).toBe(true);
    expect(matchesAttachmentMagicBytes(ZIP_HEAD, XLSX_MIME)).toBe(true);
  });

  it('rifiuta un eseguibile rinominato .pdf', () => {
    expect(matchesAttachmentMagicBytes(EXE_HEAD, 'application/pdf')).toBe(false);
  });
});

describe('assertValidAttachmentFile', () => {
  it('accetta un PDF valido e ne restituisce il MIME', () => {
    const mime = assertValidAttachmentFile({
      buffer: PDF_HEAD,
      size: PDF_HEAD.length,
      mimetype: 'application/pdf',
      originalname: 'fattura.pdf',
    });
    expect(mime).toBe('application/pdf');
  });

  it('rifiuta oltre 5 MB con il messaggio della spec', () => {
    expect(() =>
      assertValidAttachmentFile({
        buffer: PDF_HEAD,
        size: MAX_ATTACHMENT_FILE_BYTES + 1,
        mimetype: 'application/pdf',
        originalname: 'grosso.pdf',
      }),
    ).toThrow(PayloadTooLargeException);
  });

  it('rifiuta i formati non ammessi', () => {
    expect(() =>
      assertValidAttachmentFile({
        buffer: ZIP_HEAD,
        size: ZIP_HEAD.length,
        mimetype: 'application/zip',
        originalname: 'archivio.zip',
      }),
    ).toThrow(BadRequestException);
  });

  it('rifiuta un eseguibile mascherato da PDF', () => {
    expect(() =>
      assertValidAttachmentFile({
        buffer: EXE_HEAD,
        size: EXE_HEAD.length,
        mimetype: 'application/pdf',
        originalname: 'virus.pdf',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('assertAttachmentQuota', () => {
  it('passa finché il totale resta entro i 20 MB', () => {
    expect(() => assertAttachmentQuota(15 * 1024 * 1024, 5 * 1024 * 1024)).not.toThrow();
  });

  it('blocca il superamento del totale documento', () => {
    expect(() => assertAttachmentQuota(18 * 1024 * 1024, 5 * 1024 * 1024)).toThrow(
      PayloadTooLargeException,
    );
  });
});

describe('messaggi', () => {
  it('formatta i MB con separatore italiano', () => {
    expect(formatMegabytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatMegabytes(3.2 * 1024 * 1024)).toBe('3,2 MB');
  });

  it('compone il messaggio di spazio esaurito come da spec', () => {
    expect(quotaExceededMessage(18 * 1024 * 1024, 5 * 1024 * 1024)).toBe(
      'Spazio esaurito per questo documento. Massimo 20 MB totali di allegati. ' +
        'Usati: 18 MB. Il nuovo file: 5 MB. Elimina un allegato per far spazio.',
    );
  });
});

describe('nomi file', () => {
  it('rimuove i separatori di percorso dal nome salvato', () => {
    expect(sanitizeAttachmentFileName('../../etc/passwd.pdf', 'pdf')).toBe('..-..-etc-passwd.pdf');
  });

  it('ripiega su un nome di default se resta vuoto', () => {
    expect(sanitizeAttachmentFileName('   ', 'pdf')).toBe('allegato.pdf');
  });

  it('rende il nome sicuro per Content-Disposition', () => {
    expect(attachmentDownloadFilename('Fattura "Acme" 2026.pdf')).toBe('Fattura-Acme-2026.pdf');
  });
});
