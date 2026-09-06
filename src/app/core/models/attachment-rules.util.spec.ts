import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  UNSUPPORTED_FORMAT_MESSAGE,
  attachmentIconClass,
  attachmentIconKind,
  fileTooLargeMessage,
  formatAttachmentSize,
  formatMegabytes,
  isAllowedAttachmentFile,
  quotaExceededMessage,
  validateAttachmentFile,
} from './attachment-rules.util';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MB = 1024 * 1024;

/**
 * Un `File` vero, col peso imposto: gli allegati di prova arrivano a 20 MB e
 * allocarli davvero costerebbe secondi di test per un valore che queste
 * funzioni si limitano a leggere.
 */
function fileOf(name: string, type: string, size = 1024): File {
  const file = new File([], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('attachmentIconKind', () => {
  it('riconosce il PDF dal MIME', () => {
    expect(attachmentIconKind('application/pdf', 'fattura.pdf')).toBe('pdf');
  });

  it('riconosce ogni immagine ammessa dal MIME', () => {
    expect(attachmentIconKind('image/jpeg', 'foto.jpg')).toBe('image');
    expect(attachmentIconKind('image/png', 'logo.png')).toBe('image');
    expect(attachmentIconKind('image/heic', 'scatto.heic')).toBe('image');
    expect(attachmentIconKind('image/heif', 'scatto.heif')).toBe('image');
  });

  it('distingue Word da Excel sui MIME OpenXML', () => {
    expect(attachmentIconKind(DOCX_MIME, 'contratto.docx')).toBe('word');
    expect(attachmentIconKind(XLSX_MIME, 'listino.xlsx')).toBe('excel');
  });

  // I browser mandano spesso `application/octet-stream` (o niente affatto) per
  // HEIC e per gli Office: senza il ripiego sull'estensione l'icona sarebbe
  // generica proprio sui formati che si riconoscono meglio a colpo d'occhio.
  it('ricade sull-estensione quando il MIME manca', () => {
    expect(attachmentIconKind('', 'fattura.pdf')).toBe('pdf');
    expect(attachmentIconKind('', 'contratto.docx')).toBe('word');
    expect(attachmentIconKind('', 'listino.xlsx')).toBe('excel');
    expect(attachmentIconKind('', 'foto.jpeg')).toBe('image');
    expect(attachmentIconKind('', 'scatto.heif')).toBe('image');
  });

  it('legge l-estensione senza badare al maiuscolo', () => {
    expect(attachmentIconKind('', 'FATTURA.PDF')).toBe('pdf');
    expect(attachmentIconKind('', 'Foto.JPG')).toBe('image');
  });

  it('ignora i parametri del MIME e il maiuscolo', () => {
    expect(attachmentIconKind('application/pdf; charset=binary', 'a.pdf')).toBe('pdf');
    expect(attachmentIconKind('APPLICATION/PDF', 'a.pdf')).toBe('pdf');
    expect(attachmentIconKind('  image/png  ; qualcosa', 'a.png')).toBe('image');
  });

  // Un MIME non ammesso NON viene scartato a favore dell'estensione: qui si
  // decide solo quale icona mostrare, e il primo valore utile vince.
  it('un MIME sconosciuto con estensione ignota resta generico', () => {
    expect(attachmentIconKind('application/zip', 'archivio.zip')).toBe('generic');
    expect(attachmentIconKind('video/mp4', 'clip.mp4')).toBe('generic');
  });

  it('senza MIME e senza estensione resta generico', () => {
    expect(attachmentIconKind('', 'documento-senza-estensione')).toBe('generic');
    expect(attachmentIconKind('')).toBe('generic');
  });
});

describe('attachmentIconClass', () => {
  it('mappa ogni formato sulla classe PrimeIcons corrispondente', () => {
    expect(attachmentIconClass('application/pdf')).toBe('pi-file-pdf');
    expect(attachmentIconClass('image/png')).toBe('pi-image');
    expect(attachmentIconClass(DOCX_MIME)).toBe('pi-file-word');
    expect(attachmentIconClass(XLSX_MIME)).toBe('pi-file-excel');
    expect(attachmentIconClass('application/zip', 'archivio.zip')).toBe('pi-file');
  });

  it('usa il nome file quando il MIME manca', () => {
    expect(attachmentIconClass('', 'listino.xlsx')).toBe('pi-file-excel');
  });
});

describe('formatAttachmentSize', () => {
  it('sotto il kilobyte mostra i byte nudi', () => {
    expect(formatAttachmentSize(0)).toBe('0 B');
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(1023)).toBe('1023 B');
  });

  it('dal kilobyte in su usa i KB con la virgola italiana', () => {
    expect(formatAttachmentSize(1024)).toBe('1,0 KB');
    expect(formatAttachmentSize(1536)).toBe('1,5 KB');
    expect(formatAttachmentSize(MB - 1)).toBe('1024,0 KB');
  });

  it('dal megabyte in su passa ai MB', () => {
    expect(formatAttachmentSize(MB)).toBe('1 MB');
    expect(formatAttachmentSize(3.2 * MB)).toBe('3,2 MB');
  });
});

describe('formatMegabytes', () => {
  it('omette il decimale quando il valore e intero', () => {
    expect(formatMegabytes(0)).toBe('0 MB');
    expect(formatMegabytes(5 * MB)).toBe('5 MB');
    expect(formatMegabytes(20 * MB)).toBe('20 MB');
  });

  it('tiene una sola cifra decimale, con la virgola', () => {
    expect(formatMegabytes(3.2 * MB)).toBe('3,2 MB');
    expect(formatMegabytes(7.3 * MB)).toBe('7,3 MB');
  });

  it('arrotonda alla prima cifra decimale', () => {
    expect(formatMegabytes(1.25 * MB)).toBe('1,3 MB');
    expect(formatMegabytes(1.04 * MB)).toBe('1 MB');
  });

  // Sotto il mezzo decimo di MB il risultato e «0 MB»: un file di pochi byte
  // non deve comparire come «0,0 MB» dentro un messaggio d'errore.
  it('un file minuscolo si riassume in 0 MB', () => {
    expect(formatMegabytes(1024)).toBe('0 MB');
  });
});

describe('messaggi di rifiuto', () => {
  it('il messaggio di file troppo grande nomina il limite e il peso reale', () => {
    expect(fileTooLargeMessage(7.3 * MB)).toBe(
      'File troppo grande. Massimo 5 MB per file. Il file pesa 7,3 MB.',
    );
  });

  it('il messaggio di quota dice limite, usato, nuovo file e come rimediare', () => {
    expect(quotaExceededMessage(18 * MB, 5 * MB)).toBe(
      'Spazio esaurito per questo documento. Massimo 20 MB totali di allegati. ' +
        'Usati: 18 MB. Il nuovo file: 5 MB. Elimina un allegato per far spazio.',
    );
  });

  it('il messaggio di formato elenca i formati accettati', () => {
    expect(UNSUPPORTED_FORMAT_MESSAGE).toBe(
      'Formato non supportato. Formati accettati: PDF, JPG, PNG, HEIC, DOCX, XLSX.',
    );
  });
});

describe('costanti condivise col server', () => {
  it('i limiti sono 5 MB per file e 20 MB per documento', () => {
    expect(MAX_ATTACHMENT_FILE_BYTES).toBe(5 * MB);
    expect(MAX_ATTACHMENT_TOTAL_BYTES).toBe(20 * MB);
  });

  // L'attributo `accept` e cio che filtra il selettore di sistema: se perde
  // un'estensione, quel formato diventa irraggiungibile pur essendo ammesso.
  it('l-attributo accept copre tutte le estensioni ammesse', () => {
    for (const extension of ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.docx', '.xlsx']) {
      expect(ATTACHMENT_ACCEPT_ATTRIBUTE).toContain(extension);
    }
    expect(ATTACHMENT_ACCEPT_ATTRIBUTE).toContain(DOCX_MIME);
    expect(ATTACHMENT_ACCEPT_ATTRIBUTE).toContain(XLSX_MIME);
  });
});

describe('isAllowedAttachmentFile', () => {
  it('accetta i formati previsti dichiarati dal MIME', () => {
    expect(isAllowedAttachmentFile(fileOf('a.pdf', 'application/pdf'))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('a.png', 'image/png'))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('a.heic', 'image/heic'))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('a.heif', 'image/heif'))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('a.docx', DOCX_MIME))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('a.xlsx', XLSX_MIME))).toBe(true);
  });

  it('accetta per estensione quando il browser non manda un MIME utile', () => {
    expect(isAllowedAttachmentFile(fileOf('foto.HEIC', 'application/octet-stream'))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('contratto.docx', ''))).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('listino.XLSX', ''))).toBe(true);
  });

  it('ignora i parametri del MIME e il maiuscolo', () => {
    expect(
      isAllowedAttachmentFile(fileOf('senza-estensione', 'application/pdf; charset=binary')),
    ).toBe(true);
    expect(isAllowedAttachmentFile(fileOf('senza-estensione', 'IMAGE/PNG'))).toBe(true);
  });

  it('rifiuta i formati fuori elenco', () => {
    expect(isAllowedAttachmentFile(fileOf('archivio.zip', 'application/zip'))).toBe(false);
    expect(isAllowedAttachmentFile(fileOf('clip.mp4', 'video/mp4'))).toBe(false);
    expect(isAllowedAttachmentFile(fileOf('fattura.xml', 'text/xml'))).toBe(false);
    expect(isAllowedAttachmentFile(fileOf('setup.exe', 'application/x-msdownload'))).toBe(false);
  });

  it('rifiuta un file senza MIME e senza estensione', () => {
    expect(isAllowedAttachmentFile(fileOf('allegato', ''))).toBe(false);
  });

  // Il client da solo un riscontro immediato: l'estensione basta ad accettare,
  // e il controllo dei byte reali resta al server, che legge i magic bytes.
  it('un eseguibile rinominato .pdf passa qui: l-autorita e il server', () => {
    expect(isAllowedAttachmentFile(fileOf('virus.pdf', 'application/x-msdownload'))).toBe(true);
  });
});

describe('validateAttachmentFile', () => {
  it('non dice nulla quando il file e a posto', () => {
    expect(validateAttachmentFile(fileOf('fattura.pdf', 'application/pdf', 2 * MB), 0)).toBeNull();
  });

  it('rifiuta prima di tutto il formato, anche se sarebbe pure troppo grande', () => {
    expect(validateAttachmentFile(fileOf('archivio.zip', 'application/zip', 9 * MB), 0)).toBe(
      UNSUPPORTED_FORMAT_MESSAGE,
    );
  });

  it('accetta il file esattamente al limite dei 5 MB', () => {
    expect(
      validateAttachmentFile(fileOf('limite.pdf', 'application/pdf', MAX_ATTACHMENT_FILE_BYTES), 0),
    ).toBeNull();
  });

  it('rifiuta un solo byte oltre il limite per file', () => {
    expect(
      validateAttachmentFile(
        fileOf('grosso.pdf', 'application/pdf', MAX_ATTACHMENT_FILE_BYTES + 1),
        0,
      ),
    ).toBe(fileTooLargeMessage(MAX_ATTACHMENT_FILE_BYTES + 1));
  });

  it('accetta il file che riempie esattamente la quota del documento', () => {
    expect(
      validateAttachmentFile(fileOf('ultimo.pdf', 'application/pdf', 2 * MB), 18 * MB),
    ).toBeNull();
  });

  it('rifiuta il file che sfora la quota del documento', () => {
    expect(validateAttachmentFile(fileOf('nuovo.pdf', 'application/pdf', 5 * MB), 18 * MB)).toBe(
      quotaExceededMessage(18 * MB, 5 * MB),
    );
  });

  // La quota e gia piena: un file da un byte non deve passare per il fatto di
  // essere piccolo.
  it('a quota piena rifiuta anche un file minuscolo', () => {
    expect(
      validateAttachmentFile(fileOf('nota.pdf', 'application/pdf', 1), MAX_ATTACHMENT_TOTAL_BYTES),
    ).toBe(quotaExceededMessage(MAX_ATTACHMENT_TOTAL_BYTES, 1));
  });
});
