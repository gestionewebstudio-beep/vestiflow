/**
 * Rasterizza le icone SVG del brand in PNG per iOS/Android.
 * Uso one-off (richiede `npm i -D sharp` temporaneo):
 *   node scripts/generate-icons.mjs
 * I PNG generati vengono committati; rilancia solo se cambia il logo SVG.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public/icons');

const standard = readFileSync(join(iconsDir, 'icon.svg'));
const maskable = readFileSync(join(iconsDir, 'icon-maskable.svg'));

const targets = [
  { svg: standard, size: 192, out: 'icon-192.png' },
  { svg: standard, size: 512, out: 'icon-512.png' },
  { svg: maskable, size: 192, out: 'icon-maskable-192.png' },
  { svg: maskable, size: 512, out: 'icon-maskable-512.png' },
  // apple-touch-icon: quadrato pieno, iOS applica i propri angoli arrotondati.
  { svg: maskable, size: 180, out: 'apple-touch-icon.png' },
];

for (const { svg, size, out } of targets) {
  const png = await sharp(svg, { density: 512 }).resize(size, size).png().toBuffer();
  writeFileSync(join(iconsDir, out), png);
  console.log(`[generate-icons] ${out} (${size}x${size})`);
}
