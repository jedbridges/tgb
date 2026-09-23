/**
 * Record dimensions, spine colour and lettering for any cover file that has none.
 *
 *   npx tsx scripts/record-covers.ts
 *
 * fetch-covers.ts does this as a side effect of fetching, but it also waits three and a
 * half seconds on every rate-limited ISBN lookup it is going to miss, which makes it an
 * hour-long way to read four hundred files off the disk. This only looks at what is
 * already there.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { legibleSpine } from '../src/lib/contrast.ts';

const META = 'src/assets/covers.json';
const DIR = 'src/assets/covers';
const meta: Record<string, any> = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
let added = 0;

for (const f of readdirSync(DIR).filter((f) => f.endsWith('.jpg'))) {
  const slug = f.replace(/\.jpg$/, '');
  if (meta[slug]?.w) continue;
  const img = sharp(`${DIR}/${f}`);
  const { width = 400, height = 600 } = await img.metadata();
  const strip = await img.clone()
    .extract({ left: 0, top: 0, width: Math.max(1, Math.round(width * 0.12)), height })
    .resize(1, 1).raw().toBuffer();
  const hex = '#' + [...strip.slice(0, 3)].map((c) => c.toString(16).padStart(2, '0')).join('');
  const legible = legibleSpine(hex);
  meta[slug] = { w: width, h: height, spine: legible.bg, spineInk: legible.ink, source: 'archive' };
  added++;
}

writeFileSync(META, JSON.stringify(meta, null, 0) + '\n');
console.log(`recorded ${added} covers; ${Object.keys(meta).length} entries total`);
