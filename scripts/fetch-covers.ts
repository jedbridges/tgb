/**
 * Fetch cover images from Open Library for works that declare cover.source: openlibrary,
 * normalise with sharp, commit to src/assets/covers/{slug}.jpg, and write spine colours to covers.json.
 *   npx tsx scripts/fetch-covers.ts [--force] [slug ...]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
import sharp from 'sharp';

const OUT = 'src/assets/covers';
const META = 'src/assets/covers.json';
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = new Set(args.filter((a) => !a.startsWith('--')));
const meta: Record<string, any> = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fm(file: string) { const m = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/); return m ? parse(m[1]) : null; }
const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

async function fetchCover(keys: { kind: 'id' | 'olid' | 'isbn'; value: string }[]): Promise<Buffer | null> {
  for (const k of keys) {
    const url = `https://covers.openlibrary.org/b/${k.kind}/${k.value}-L.jpg?default=false`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'the-great-books/1.0 (cover cache build)' } });
      if (k.kind === 'isbn') await sleep(3500); // isbn lookups are rate limited
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue;
      const m = await sharp(buf).metadata();
      if (!m.width || m.width < 280) continue;
      return buf;
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const files = readdirSync('src/content/works').filter((f) => f.endsWith('.md'));
  let done = 0, miss = 0, skip = 0;
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    if (only.size && !only.has(slug)) continue;
    const d = fm(`src/content/works/${f}`);
    if (!d) continue;
    const out = `${OUT}/${slug}.jpg`;
    if (existsSync(out) && !force) {
      if (!meta[slug]) await record(slug, out, 'existing');
      skip++; continue;
    }
    if (d.cover?.source !== 'openlibrary') { skip++; continue; }
    const keys: { kind: 'id' | 'olid' | 'isbn'; value: string }[] = [];
    if (d.cover.coverId) keys.push({ kind: 'id', value: String(d.cover.coverId) });
    if (d.cover.olid) keys.push({ kind: 'olid', value: d.cover.olid });
    for (const isbn of [d.cover.isbn13, d.recommendedEdition?.isbn13, ...(d.otherEditions ?? []).map((e: any) => e.isbn13)]) if (isbn && !keys.some((k) => k.value === isbn)) keys.push({ kind: 'isbn', value: isbn });
    if (!keys.length) { skip++; continue; }
    const buf = await fetchCover(keys);
    if (!buf) { console.log(`  miss  ${slug}`); miss++; continue; }
    await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
    await record(slug, out, 'openlibrary');
    console.log(`  ok    ${slug}`); done++;
  }
  writeFileSync(META, JSON.stringify(meta, null, 0) + '\n');
  console.log(`covers: ${done} fetched, ${miss} missed, ${skip} skipped`);
}
async function record(slug: string, file: string, source: string) {
  const img = sharp(file);
  const { width = 400, height = 600 } = await img.metadata();
  const strip = await img.clone().extract({ left: 0, top: 0, width: Math.max(1, Math.round(width * 0.12)), height }).resize(1, 1).raw().toBuffer();
  const hex = '#' + [...strip.slice(0, 3)].map((c) => c.toString(16).padStart(2, '0')).join('');
  meta[slug] = { w: width, h: height, spine: hex, spineInk: luminance(hex) > 0.45 ? '#2a2422' : '#f2e8e4', source };
}
main();
