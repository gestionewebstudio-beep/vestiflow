import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

/**
 * Regole allegati condivise dai due sottosistemi (allegati generici e
 * allegati documento): formati ammessi, limiti di dimensione e verifica dei
 * magic bytes. Il client applica le stesse regole per dare feedback immediato,
 * ma il server resta l'unica autorità.
 */

/** Massimo per singolo file. */
export const MAX_ATTACHMENT_FILE_BYTES = 5 * 1024 * 1024;

/** Massimo complessivo degli allegati di una singola entità. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

/** MIME accettati → estensione usata nello storage. */
const ALLOWED_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Estensioni accettate: fallback quando il browser non fornisce il MIME. */
const ALLOWED_EXTENSIONS: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const UNSUPPORTED_FORMAT_MESSAGE =
  'Formato non supportato. Formati accettati: PDF, JPG, PNG, HEIC, DOCX, XLSX.';

/** "File troppo grande. Massimo 5 MB per file. Il file pesa 7,3 MB." */
export function fileTooLargeMessage(sizeBytes: number): string {
  return `File troppo grande. Massimo ${formatMegabytes(MAX_ATTACHMENT_FILE_BYTES)} per file. Il file pesa ${formatMegabytes(sizeBytes)}.`;
}

/** Messaggio di quota esaurita, con usato e peso del nuovo file. */
export function quotaExceededMessage(usedBytes: number, incomingBytes: number): string {
  return (
    `Spazio esaurito per questo documento. Massimo ${formatMegabytes(MAX_ATTACHMENT_TOTAL_BYTES)} totali di allegati. ` +
    `Usati: ${formatMegabytes(usedBytes)}. Il nuovo file: ${formatMegabytes(incomingBytes)}. ` +
    'Elimina un allegato per far spazio.'
  );
}

/** MB con una cifra decimale solo se serve (5 MB, 3,2 MB) — separatore it-IT. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = Math.round(mb * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text} MB`;
}

/** Estensione file dal nome originale (minuscola, senza punto). */
function extensionOf(fileName: string | undefined): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName ?? '');
  return match?.[1]?.toLowerCase() ?? '';
}

/**
 * MIME normalizzato del file: alcuni browser inviano `application/octet-stream`
 * (tipico di HEIC e degli Office su Windows), quindi si ricade sull'estensione.
 */
export function resolveAttachmentMime(
  declaredMime: string | undefined,
  fileName: string | undefined,
): string | null {
  const declared = (declaredMime ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  if (ALLOWED_MIME_EXTENSIONS[declared]) {
    return declared;
  }
  return ALLOWED_EXTENSIONS[extensionOf(fileName)] ?? null;
}

export function attachmentExtensionForMime(mime: string): string {
  return ALLOWED_MIME_EXTENSIONS[mime] ?? 'bin';
}

/**
 * Verifica il contenuto reale del file: impedisce che un eseguibile o un
 * archivio rinominato `.pdf` superi il controllo sul solo MIME dichiarato.
 * DOCX e XLSX sono ZIP (PK): il controllo si ferma alla firma del contenitore.
 */
export function matchesAttachmentMagicBytes(buffer: Buffer, mime: string): boolean {
  switch (mime) {
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/heic':
    case 'image/heif':
      // ISO-BMFF: box "ftyp" a offset 4, marchio heic/heix/hevc/mif1.
      return (
        buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
        ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(
          buffer.subarray(8, 12).toString('ascii'),
        )
      );
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return buffer[0] === 0x50 && buffer[1] === 0x4b;
    default:
      return false;
  }
}

/**
 * Valida il file in ingresso e restituisce il MIME normalizzato da persistere.
 * Lancia 400/413 con i messaggi mostrati all'utente.
 */
export function assertValidAttachmentFile(file: {
  readonly buffer?: Buffer;
  readonly size?: number;
  readonly mimetype?: string;
  readonly originalname?: string;
}): string {
  if (!file?.buffer?.length) {
    throw new BadRequestException('File allegato mancante');
  }
  const size = file.size ?? file.buffer.length;
  if (size > MAX_ATTACHMENT_FILE_BYTES) {
    throw new PayloadTooLargeException(fileTooLargeMessage(size));
  }
  const mime = resolveAttachmentMime(file.mimetype, file.originalname);
  if (!mime) {
    throw new BadRequestException(UNSUPPORTED_FORMAT_MESSAGE);
  }
  if (!matchesAttachmentMagicBytes(file.buffer, mime)) {
    throw new BadRequestException(
      'Il contenuto del file non corrisponde al formato dichiarato: allegato rifiutato.',
    );
  }
  return mime;
}

/** Quota per entità: lancia 413 col dettaglio di usato e nuovo file. */
export function assertAttachmentQuota(usedBytes: number, incomingBytes: number): void {
  if (usedBytes + incomingBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new PayloadTooLargeException(quotaExceededMessage(usedBytes, incomingBytes));
  }
}

/**
 * Nome file per l'header Content-Disposition: solo ASCII sicuro, niente
 * virgolette né spazi che romperebbero l'header.
 */
export function attachmentDownloadFilename(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return cleaned || 'allegato';
}

/** Nome file sanificato: niente separatori di percorso né caratteri di controllo. */
export function sanitizeAttachmentFileName(name: string, fallbackExtension: string): string {
  const cleaned = [...name]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .replace(/[/\\]/g, '-')
    .trim()
    .slice(0, 255);
  return cleaned || `allegato.${fallbackExtension}`;
}
