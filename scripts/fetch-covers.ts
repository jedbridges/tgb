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
/*
 * --from-isbn: adopt real cover art for works that are still on a generated cover but now
 * carry a recommended-edition ISBN. On a hit the frontmatter is flipped to openlibrary so
 * the work keeps the image from then on; on a miss it stays generated, which is a perfectly
 * good outcome and not a failure.
 */
const fromIsbn = args.includes('--from-isbn');
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

/** Normalised word overlap, for deciding which work an anthology cover belongs to. */
const normTitle = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'on', 'in', 'to', 'vol', 'volume']);
function affinity(a: string, b: string): number {
  const x = normTitle(a).split(' ').filter((w) => w && !STOP.has(w));
  const y = new Set(normTitle(b).split(' ').filter(Boolean));
  return x.length ? x.filter((w) => y.has(w)).length / x.length : 0;
}

/**
 * One ISBN, one cover, one work.
 *
 * Twenty-six of these ISBNs are anthologies that several works share, and handing the same
 * jacket to eight Aristotle treatises puts eight identical books on one shelf. The image
 * goes to whichever of them the edition is most plausibly *of*, by title, and only when
 * that is clear; the rest keep a generated cover, which at least names the work it is for.
 */
function resolveSharing(cands: { slug: string; isbn: string; work: string; edTitle: string }[]) {
  const byIsbn = new Map<string, typeof cands>();
  for (const c of cands) byIsbn.set(c.isbn, [...(byIsbn.get(c.isbn) ?? []), c]);
  const winners: typeof cands = [];
  let ceded = 0;
  for (const group of byIsbn.values()) {
    if (group.length === 1) { winners.push(group[0]); continue; }
    const scored = group.map((c) => ({ c, a: affinity(c.work, c.edTitle) })).sort((x, y) => y.a - x.a);
    if (scored[0].a >= 0.5 && scored[0].a > (scored[1]?.a ?? 0)) { winners.push(scored[0].c); ceded += group.length - 1; }
    else ceded += group.length;
  }
  return { winners, ceded };
}

/**
 * Flip a generated cover to openlibrary, in place, without touching anything else.
 *
 * Two shapes exist in the content, the flow form on one line and a block with the keys
 * indented under it, so both are matched and the whole declaration is replaced. Earlier in
 * this project a regex that matched only a block's first line orphaned its children and
 * corrupted six files, which is why this refuses outright rather than guessing when it
 * meets a third shape.
 */
function adopt(file: string, isbn: string) {
  const raw = readFileSync(file, 'utf8');
  const flow = /^cover:[ \t]*\{[^}]*\}[ \t]*$/m;
  const block = /^cover:[ \t]*\n(?:[ \t]+\S.*\n?)+/m;
  const replacement = `cover: { source: openlibrary, isbn13: "${isbn}" }`;
  if (flow.test(raw)) writeFileSync(file, raw.replace(flow, replacement));
  else if (block.test(raw)) writeFileSync(file, raw.replace(block, `${replacement}\n`));
  else throw new Error(`${file}: cover declaration is in a shape this does not know how to rewrite`);
}

async function main() {
  const files = readdirSync('src/content/works').filter((f) => f.endsWith('.md'));

  if (fromIsbn) {
    const cands: { slug: string; isbn: string; work: string; edTitle: string }[] = [];
    for (const f of files) {
      const slug = f.replace(/\.md$/, '');
      if (only.size && !only.has(slug)) continue;
      const d = fm(`src/content/works/${f}`);
      const isbn = d?.recommendedEdition?.isbn13;
      if (!d || d.cover?.source !== 'generated' || !isbn) continue;
      if (existsSync(`${OUT}/${slug}.jpg`) && !force) continue;
      cands.push({ slug, isbn: String(isbn), work: d.title ?? slug, edTitle: d.recommendedEdition?.title ?? '' });
    }
    const { winners, ceded } = resolveSharing(cands);
    console.log(`${cands.length} works on a generated cover now have an ISBN`);
    console.log(`  ${winners.length} will be tried, ${ceded} cede a shared anthology cover and stay generated\n`);
    let got = 0, missed = 0;
    for (const c of winners) {
      const buf = await fetchCover([{ kind: 'isbn', value: c.isbn }]);
      if (!buf) { missed++; continue; }
      const out = `${OUT}/${c.slug}.jpg`;
      await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
      await record(c.slug, out, 'openlibrary');
      adopt(`src/content/works/${c.slug}.md`, c.isbn);
      console.log(`  ok    ${c.slug}`); got++;
    }
    writeFileSync(META, JSON.stringify(meta, null, 0) + '\n');
    console.log(`\nadopted ${got} real covers, ${missed} had no image on Open Library`);
    return;
  }
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
