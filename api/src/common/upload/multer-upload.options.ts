import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { MAX_ATTACHMENT_FILE_BYTES } from '../attachments/attachment-rules.util';

/** Limiti multer allineati alle advisory CVE-2026-5079 / CVE-2026-5038 (fieldNestingDepth + fields). */
const BASE_LIMITS = {
  fields: 10,
  fieldNestingDepth: 1,
} as const;

export const csvUploadMulterOptions: MulterOptions = {
  limits: {
    ...BASE_LIMITS,
    fileSize: 15 * 1024 * 1024,
  },
};

export const productImageUploadMulterOptions: MulterOptions = {
  limits: {
    ...BASE_LIMITS,
    fileSize: 5 * 1024 * 1024,
  },
};

export const avatarUploadMulterOptions: MulterOptions = {
  limits: {
    ...BASE_LIMITS,
    fileSize: 2 * 1024 * 1024,
  },
};

/** Allegati documento/ordine: 5 MB per file (limite applicativo condiviso). */
export const documentAttachmentUploadMulterOptions: MulterOptions = {
  limits: {
    ...BASE_LIMITS,
    fileSize: MAX_ATTACHMENT_FILE_BYTES,
  },
};

/** Backup tenant ZIP (export/import titolare). */
export const tenantBackupUploadMulterOptions: MulterOptions = {
  limits: {
    fields: 5,
    fileSize: 250 * 1024 * 1024,
  },
};
