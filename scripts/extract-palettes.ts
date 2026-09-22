/**
 * Write one borrowed colour per cover into covers.json.
 *
 *   npx tsx scripts/extract-palettes.ts [--force] [slug ...]
 *
 * Build time only: the JSON is imported by the site, never fetched by it, so this costs a
 * reader nothing. Covers with no colour worth borrowing are recorded as such rather than
 * left undecided, so the next run does not test them again.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { coverPalette } from './lib/palette.ts';

const META = 'src/assets/covers.json';
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = new Set(args.filter((a) => !a.startsWith('--')));

const meta: Record<string, any> = JSON.parse(readFileSync(META, 'utf8'));
let done = 0, grey = 0, skip = 0, miss = 0;

for (const slug of Object.keys(meta)) {
  if (only.size && !only.has(slug)) continue;
  if (!force && 'tint' in meta[slug]) { skip++; continue; }
  const file = `src/assets/covers/${slug}.jpg`;
  if (!existsSync(file)) { miss++; continue; }
  const p = await coverPalette(file);
  if (!p) { meta[slug].tint = null; grey++; continue; }
  meta[slug].tint = [p.tint.l, p.tint.c, p.tint.h];
  if (p.tint2) meta[slug].tint2 = [p.tint2.l, p.tint2.c, p.tint2.h];
  else delete meta[slug].tint2;
  done++;
}

writeFileSync(META, JSON.stringify(meta, null, 0) + '\n');
console.log(`palettes: ${done} tinted, ${grey} too grey to tint, ${skip} already done, ${miss} without a file`);
