/**
 * Regole allegati lato client: stessi formati e limiti applicati dal server
 * (api/src/common/attachments/attachment-rules.util.ts). Qui servono a dare
 * feedback immediato senza sprecare un upload; il server resta l'autorità.
 */

/** Massimo per singolo file. */
export const MAX_ATTACHMENT_FILE_BYTES = 5 * 1024 * 1024;

/** Massimo complessivo degli allegati di un documento. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

/** Estensioni accettate → MIME canonico. */
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

const ALLOWED_MIME: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Valore dell'attributo `accept` dell'input file. */
export const ATTACHMENT_ACCEPT_ATTRIBUTE =
  '.pdf,.jpg,.jpeg,.png,.heic,.heif,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/heic,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const UNSUPPORTED_FORMAT_MESSAGE =
  'Formato non supportato. Formati accettati: PDF, JPG, PNG, HEIC, DOCX, XLSX.';

/** Icona PrimeIcons coerente col formato dell'allegato. */
export type AttachmentIconKind = 'pdf' | 'image' | 'word' | 'excel' | 'generic';

export function attachmentIconKind(mimeType: string, fileName = ''): AttachmentIconKind {
  const mime = normalizeMime(mimeType) || ALLOWED_EXTENSIONS[extensionOf(fileName)] || '';
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime.includes('wordprocessingml')) {
    return 'word';
  }
  if (mime.includes('spreadsheetml')) {
    return 'excel';
  }
  return 'generic';
}

const ICON_CLASSES: Readonly<Record<AttachmentIconKind, string>> = {
  pdf: 'pi-file-pdf',
  image: 'pi-image',
  word: 'pi-file-word',
  excel: 'pi-file-excel',
  generic: 'pi-file',
};

export function attachmentIconClass(mimeType: string, fileName = ''): string {
  return ICON_CLASSES[attachmentIconKind(mimeType, fileName)];
}

/** Dimensione leggibile: B, KB o MB con separatore italiano. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  }
  return formatMegabytes(bytes);
}

/** MB con una cifra decimale solo se serve (5 MB, 3,2 MB). */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = Math.round(mb * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text} MB`;
}

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

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match?.[1]?.toLowerCase() ?? '';
}

function normalizeMime(mimeType: string): string {
  return mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
}

/** Formato ammesso? Il MIME del browser può mancare: si guarda l'estensione. */
export function isAllowedAttachmentFile(file: File): boolean {
  return (
    ALLOWED_MIME.has(normalizeMime(file.type)) ||
    Boolean(ALLOWED_EXTENSIONS[extensionOf(file.name)])
  );
}

/**
 * Verifica un file prima dell'upload: formato, dimensione e spazio residuo.
 * Restituisce il messaggio d'errore da mostrare, null se il file è valido.
 */
export function validateAttachmentFile(file: File, usedBytes: number): string | null {
  if (!isAllowedAttachmentFile(file)) {
    return UNSUPPORTED_FORMAT_MESSAGE;
  }
  if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
    return fileTooLargeMessage(file.size);
  }
  if (usedBytes + file.size > MAX_ATTACHMENT_TOTAL_BYTES) {
    return quotaExceededMessage(usedBytes, file.size);
  }
  return null;
}
