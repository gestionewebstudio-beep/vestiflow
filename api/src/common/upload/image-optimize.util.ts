import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const PRODUCT_IMAGE_MAX_EDGE_PX = 2000;
export const PRODUCT_IMAGE_WEBP_QUALITY = 82;
export const AVATAR_IMAGE_MAX_EDGE_PX = 512;
export const AVATAR_IMAGE_WEBP_QUALITY = 80;

export const UPLOAD_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadImageMimeType = (typeof UPLOAD_IMAGE_MIME_TYPES)[number];

export interface OptimizedImagePayload {
  readonly buffer: Buffer;
  readonly contentType: 'image/webp';
  readonly extension: 'webp';
  readonly width: number;
  readonly height: number;
}

export interface OptimizeUploadedImageOptions {
  readonly maxEdgePx: number;
  readonly quality: number;
}

/** Valida MIME dichiarato + magic bytes (difesa in profondità prima di sharp). */
export function assertUploadImageMimeAndMagicBytes(
  buffer: Buffer,
  mime: string,
  allowedMime: ReadonlySet<string>,
): asserts mime is UploadImageMimeType {
  if (!allowedMime.has(mime)) {
    throw new BadRequestException('Formato non supportato. Usa JPEG, PNG o WebP.');
  }
  if (!matchesImageMagicBytes(buffer, mime)) {
    throw new BadRequestException("Il file non è un'immagine valida");
  }
}

/**
 * Ridimensiona (fit inside, no upscale), converte in WebP e rimuove metadati EXIF.
 * I client possono caricare JPEG/PNG/WebP fino al limite Multer; lo storage salva WebP.
 */
export async function optimizeUploadedImageToWebp(
  buffer: Buffer,
  options: OptimizeUploadedImageOptions,
): Promise<OptimizedImagePayload> {
  try {
    const pipeline = sharp(buffer, { failOn: 'error', animated: false })
      .rotate()
      .resize(options.maxEdgePx, options.maxEdgePx, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    const optimized = await pipeline
      .webp({
        quality: options.quality,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: optimized.data,
      contentType: 'image/webp',
      extension: 'webp',
      width: optimized.info.width,
      height: optimized.info.height,
    };
  } catch {
    throw new BadRequestException("Il file non è un'immagine valida o è corrotto");
  }
}

function matchesImageMagicBytes(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') {
    return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (mime === 'image/png') {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}
