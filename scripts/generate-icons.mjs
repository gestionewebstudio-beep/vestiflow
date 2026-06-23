/**
 * Compone le icone PWA/iOS da icon-artwork.png (sorgente VF + squircle).
 * Uso: npm run icons:generate
 * PWA: ARTWORK_SCALE / OFFSET_Y per launcher circolare Android/iOS.
 * Topbar: TOPBAR_* per lettere più leggibili in UI desktop.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public/icons');
const artworkPath = join(iconsDir, 'icon-artwork.png');

if (!existsSync(artworkPath)) {
  throw new Error(`Artwork mancante: ${artworkPath} (copia qui la sorgente VF)`);
}

const CANVAS = 512;
const BACKGROUND = '#1a1a1a';

/** PWA: logo più piccolo = margine per crop circolare launcher. */
const PWA_ARTWORK_SCALE = 0.78;
const PWA_OFFSET_Y = 24;

/** Topbar desktop: VF più grande, centratura ottica senza crop launcher. */
const TOPBAR_ARTWORK_SCALE = 0.92;
const TOPBAR_OFFSET_Y = 8;

async function composeIcon({ artworkScale, offsetY }) {
  const meta = await sharp(artworkPath).metadata();
  const sourceWidth = meta.width ?? CANVAS;
  const sourceHeight = meta.height ?? CANVAS;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const extractLeft = Math.round((sourceWidth - cropSize) / 2);
  const extractTop = Math.round((sourceHeight - cropSize) / 2);
  const artSize = Math.round(CANVAS * artworkScale);

  const artwork = await sharp(artworkPath)
    .extract({ left: extractLeft, top: extractTop, width: cropSize, height: cropSize })
    .resize(artSize, artSize)
    .png()
    .toBuffer();

  const left = Math.round((CANVAS - artSize) / 2);
  const top = Math.round((CANVAS - artSize) / 2) + offsetY;

  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: artwork, left, top }])
    .png()
    .toBuffer();
}

const pwaIcon = await composeIcon({
  artworkScale: PWA_ARTWORK_SCALE,
  offsetY: PWA_OFFSET_Y,
});
const topbarIcon = await composeIcon({
  artworkScale: TOPBAR_ARTWORK_SCALE,
  offsetY: TOPBAR_OFFSET_Y,
});

await sharp(pwaIcon).toFile(join(iconsDir, 'icon-512.png'));
console.log('[generate-icons] icon-512.png');

const pwaTargets = [
  { size: 192, out: 'icon-192.png' },
  { size: 192, out: 'icon-maskable-192.png' },
  { size: 512, out: 'icon-maskable-512.png' },
  { size: 180, out: 'apple-touch-icon.png' },
];

for (const { size, out } of pwaTargets) {
  await sharp(pwaIcon).resize(size, size).png().toFile(join(iconsDir, out));
  console.log(`[generate-icons] ${out} (${size}x${size})`);
}

await sharp(topbarIcon).resize(192, 192).png().toFile(join(iconsDir, 'icon-topbar.png'));
console.log('[generate-icons] icon-topbar.png (192x192)');

await sharp(pwaIcon).resize(32, 32).png().toFile(join(root, 'public/favicon.png'));
console.log('[generate-icons] favicon.png (32x32)');
