import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  AVATAR_IMAGE_MAX_EDGE_PX,
  optimizeUploadedImageToWebp,
  PRODUCT_IMAGE_MAX_EDGE_PX,
  PRODUCT_IMAGE_WEBP_QUALITY,
} from './image-optimize.util';

describe('image-optimize.util', () => {
  it('converte JPEG in WebP più leggero e ridimensionato', async () => {
    const source = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const optimized = await optimizeUploadedImageToWebp(source, {
      maxEdgePx: PRODUCT_IMAGE_MAX_EDGE_PX,
      quality: PRODUCT_IMAGE_WEBP_QUALITY,
    });

    expect(optimized.contentType).toBe('image/webp');
    expect(optimized.extension).toBe('webp');
    expect(optimized.width).toBeLessThanOrEqual(PRODUCT_IMAGE_MAX_EDGE_PX);
    expect(optimized.height).toBeLessThanOrEqual(PRODUCT_IMAGE_MAX_EDGE_PX);
    expect(optimized.buffer.length).toBeLessThan(source.length);

    const meta = await sharp(optimized.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('preserva trasparenza PNG in WebP', async () => {
    const source = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const optimized = await optimizeUploadedImageToWebp(source, {
      maxEdgePx: AVATAR_IMAGE_MAX_EDGE_PX,
      quality: 80,
    });

    const meta = await sharp(optimized.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.hasAlpha).toBe(true);
  });
});
