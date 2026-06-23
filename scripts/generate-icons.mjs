/**
 * Rasterizza icon-512.png (master brand) in tutte le dimensioni PWA/iOS.
 * Uso: npm run icons:generate
 * Sostituisci public/icons/icon-512.png e rilancia se cambia il logo.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public/icons');
const masterPath = join(iconsDir, 'icon-512.png');

if (!existsSync(masterPath)) {
  throw new Error(`Master icon mancante: ${masterPath}`);
}

const targets = [
  { size: 192, out: 'icon-192.png' },
  { size: 192, out: 'icon-maskable-192.png' },
  { size: 512, out: 'icon-maskable-512.png' },
  { size: 180, out: 'apple-touch-icon.png' },
];

for (const { size, out } of targets) {
  await sharp(masterPath).resize(size, size).png().toBuffer().then((png) =>
    sharp(png).toFile(join(iconsDir, out)),
  );
  console.log(`[generate-icons] ${out} (${size}x${size})`);
}

await sharp(masterPath)
  .resize(32, 32)
  .png()
  .toFile(join(root, 'public/favicon.png'));

console.log('[generate-icons] favicon.png (32x32)');
