/**
 * Throw out the adopted scans that are not covers.
 *
 *   npx tsx scripts/prune-scans.ts [--dry]
 *
 * find-scans.ts checked that an image was the right size, the right shape and not flat,
 * and that turned out to be far too little. The Internet Archive serves whatever leaf a
 * scan begins with, and for a third of these that was not a cover at all: Google's digital
 * copyright notice, a library's barcode leaf, a blank board. A page of legal boilerplate
 * under a book's title is worse than the plain typographic cover it replaced.
 *
 * Two signatures separate them, measured across all 194 adopted covers against a dozen
 * known-good and known-bad examples:
 *
 *   - Google's notice page is white. Every one of them measures 80% near-white pixels with
 *     the blue logo in the top-left corner, because it is the same page every time. Not one
 *     good cover in the set has ANY near-white area: a scanned board or title page is
 *     cream, tan or cloth, never paper-white. So near-white over half the image is decisive.
 *   - A blank board is the opposite: almost entirely dark AND without structure. Darkness
 *     alone is not enough, because a gilt-stamped cloth binding is dark too and is one of
 *     the handsomest things in the set; what separates them is edge energy, the average
 *     difference between neighbouring pixels. A plain board reads under 2.3, a stamped or
 *     illustrated one reads 3 to 14.
 *
 * What this cannot catch is a barcode sticker on an otherwise ordinary leaf, which looks
 * like a cover to any statistic. Those need an eye.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import sharp from 'sharp';

const dry = process.argv.includes('--dry');
const META = 'src/assets/covers.json';
const meta: Record<string, any> = JSON.parse(readFileSync(META, 'utf8'));
const files = readdirSync('src/content/works').filter((f) => f.endsWith('.md'));
const dropped: string[] = [];

for (const f of files) {
  const path = `src/content/works/${f}`;
  const src = readFileSync(path, 'utf8');
  if (!/^cover:\n  source: archive/m.test(src)) continue;
  const slug = f.replace('.md', '');
  const jpg = `src/assets/covers/${slug}.jpg`;
  if (!existsSync(jpg)) continue;

  const { data, info } = await sharp(jpg).resize(64, 96, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let white = 0, ink = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (r > 222 && g > 222 && b > 222) white++;
    if (0.299 * r + 0.587 * g + 0.114 * b < 120) ink++;
  }
  const w = white / n, k = ink / n;

  const g = await sharp(jpg).greyscale().resize(48, 72, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let diff = 0, pairs = 0;
  for (let y = 0; y < g.info.height; y++) for (let x = 1; x < g.info.width; x++) { diff += Math.abs(g.data[y * g.info.width + x] - g.data[y * g.info.width + x - 1]); pairs++; }
  for (let y = 1; y < g.info.height; y++) for (let x = 0; x < g.info.width; x++) { diff += Math.abs(g.data[y * g.info.width + x] - g.data[(y - 1) * g.info.width + x]); pairs++; }
  const edge = diff / pairs;

  const why = w > 0.5 ? `${Math.round(w * 100)}% near-white, a notice page or a blank leaf`
    : k > 0.90 && edge < 2.3 ? `${Math.round(k * 100)}% ink and no structure, a blank board` : null;
  if (!why) continue;

  dropped.push(slug);
  console.log(`  drop  ${slug.padEnd(48)} ${why}`);
  if (dry) continue;
  writeFileSync(path, src.replace(/^cover:\n(?:  .*\n)+/m, 'cover: { source: generated }\n'));
  unlinkSync(jpg);
  delete meta[slug];
}

if (!dry) writeFileSync(META, JSON.stringify(meta, null, 0) + '\n');
console.log(`\npruned ${dropped.length} scans back to a generated cover${dry ? ' (dry run)' : ''}`);
