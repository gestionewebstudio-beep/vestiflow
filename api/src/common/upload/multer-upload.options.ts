import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

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
