/**
 * Find a free, legal copy of every work on the lists that has no hosted text here.
 *
 *   npx tsx scripts/find-free.ts              every candidate, writing the report
 *   npx tsx scripts/find-free.ts plato        candidates whose slug contains "plato"
 *   npx tsx scripts/find-free.ts --fresh      ignore the cache and ask both hosts again
 *
 * Sibling of scripts/find-texts.ts, which finds texts to fetch and host. This one only
 * finds links: Standard Ebooks first, because their editions are proofread and typeset,
 * then Project Gutenberg through Gutendex. It writes every candidate with a score to
 * .cache/free-candidates.json; scripts/write-free.ts turns the confident ones into
 * src/content/free-sources.yaml and leaves the rest for a person to judge.
 *
 * Gutenberg is read from its own catalogue file, all 90,000 rows of it, downloaded once
 * and matched here. Their search API answers a query in about forty seconds, which across
 * three hundred authors is an afternoon; the catalogue is twenty megabytes and arrives in
 * two seconds. Standard Ebooks has no such file, so it is searched once per author, which
 * it answers quickly. Both are cached under .cache/free, so a second run asks nothing.
 *
 * Copyright is the whole point of the filter. A work is a candidate only when it was
 * written before 1930 and its author died before 1956, and a translated work needs a
 * translation old enough to be public domain too. That last part is not something a date
 * in our own frontmatter can answer, so it is delegated: if Standard Ebooks or Gutenberg
 * publishes it, they have already made that judgement, and they are careful about it.
 * Run where those two hosts are reachable; the build container is not.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

export {};

interface SEHit { url: string; titleSlug: string; translator?: string }
interface PGHit { url: string; id: number; title: string; translator?: string; downloads: number }
export interface Cand {
  slug: string; title: string; authorName: string; year: number; language: string;
  se?: SEHit & { score: number };
  pg?: PGHit & { score: number };
  score: number;
}

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const filter = args.find((a) => !a.startsWith('--'))?.toLowerCase();

const UA = 'greatbookslist.com free-link check';
const TIMEOUT = 25_000;
const LANES = 3;          // three at a time: enough to finish, gentle on a volunteer host
const SLEEP = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync('.cache/free', { recursive: true });

async function get(url: string, asJson = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      const body = await res.text();
      return asJson ? JSON.parse(body) : body;
    } catch { await sleep(800 * (attempt + 1)); }
  }
  return null;
}

/** One reply per author, kept on disk. Re-running is then free and asks nobody anything. */
async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const path = `.cache/free/${key.replace(/[^a-z0-9._-]/gi, '_')}.json`;
  if (!fresh && existsSync(path)) {
    try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { /* refetch a bad file */ }
  }
  const value = await load();
  if (value !== null) writeFileSync(path, JSON.stringify(value));
  return value;
}

/* ---------- the catalogue, read straight from the content files ---------- */

const field = (text: string, key: string) => new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, 'm').exec(text)?.[1];
const list = (text: string, key: string) =>
  (new RegExp(`^${key}:\\s*\\[(.*?)\\]`, 'm').exec(text)?.[1] ?? '')
    .split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);

const authors = new Map<string, { name: string; died?: number; aliases: string[] }>();
for (const f of readdirSync('src/content/authors')) {
  const t = readFileSync(`src/content/authors/${f}`, 'utf8');
  const died = field(t, 'died');
  authors.set(f.replace(/\.[a-z]+$/, ''), {
    name: field(t, 'name') ?? '',
    died: died ? Number(died) : undefined,
    aliases: list(t, 'aliases'),
  });
}

const hosted = new Set(readdirSync('src/content/texts'));

const works = readdirSync('src/content/works')
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const slug = f.slice(0, -3);
    const fm = readFileSync(`src/content/works/${f}`, 'utf8').split('\n---')[0];
    const authorId = field(fm, 'author') ?? '';
    const a = authors.get(authorId);
    return {
      slug, authorId,
      title: field(fm, 'title') ?? '',
      aliases: list(fm, 'aliases'),
      authorName: a?.name ?? '',
      authorAliases: a?.aliases ?? [],
      died: a?.died,
      year: Number(field(fm, 'year') ?? 0),
      language: field(fm, 'language') ?? '',
    };
  });

const candidates = works.filter(
  (w) => !hosted.has(w.slug) && w.year < 1930 && (w.died === undefined || w.died < 1956) && (!filter || w.slug.includes(filter)),
);
const byAuthor = new Map<string, typeof candidates>();
for (const w of candidates) byAuthor.set(w.authorId, [...(byAuthor.get(w.authorId) ?? []), w]);
console.log(`${candidates.length} candidates of ${works.length} works, ${byAuthor.size} authors (${hosted.size} hosted here already)\n`);

/* ---------- matching ---------- */

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['the', 'a', 'an', 'of', 'on', 'and', 'or', 'to', 'in', 'for', 'from', 'with', 'by',
  'complete', 'vol', 'volume', 'book', 'books', 'part', 'first', 'second', 'third', 'new', 'being', 'his', 'her', 'its']);
const words = (s: string) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

const surnamesOf = (name: string, aliases: string[]) =>
  [name, ...aliases].map((n) => norm(n).split(' ').pop() ?? '').filter((s) => s.length > 2);

/**
 * How much of our title theirs covers, at its best over our aliases. A book is catalogued
 * under many names ("The Nicomachean ethics of Aristotle", "Ethics"), so the test is
 * coverage of our side rather than equality: our title fully contained in theirs scores 1.
 */
function titleScore(mine: string[], theirs: string) {
  const b = new Set(words(theirs));
  let best = 0;
  for (const m of mine) {
    const a = words(m);
    if (!a.length) continue;
    best = Math.max(best, a.filter((w) => b.has(w)).length / a.length);
  }
  return best;
}

/* ---------- Standard Ebooks ---------- */

async function seForAuthor(w: (typeof candidates)[number]): Promise<SEHit[]> {
  const html = (await cached(`se-${w.authorId}`, () =>
    get(`https://standardebooks.org/ebooks?query=${encodeURIComponent(w.authorName)}`) as Promise<string | null>,
  )) as string | null;
  if (!html) return [];
  /*
   * Search results list placeholders too: a page for a book Standard Ebooks wants to make
   * and has not, with a sponsor button and nothing to read. Each result is a schema:Book
   * <li>, and a placeholder's carries a placeholder cover, so only the real ones are kept.
   */
  const real = [...html.matchAll(/<li[^>]*typeof="schema:Book"[^>]*>[\s\S]*?<\/li>/g)]
    .map((m) => m[0]).filter((li) => !/placeholder/.test(li)).join('\n');
  const paths = [...new Set([...(real || html).matchAll(/href="(\/ebooks\/[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)"/g)].map((m) => m[1]))];
  const surnames = surnamesOf(w.authorName, w.authorAliases);
  return paths
    .map((p) => p.split('/').filter(Boolean))              // ebooks, author, title, [translator]
    .filter((parts) => surnames.some((s) => parts[1].includes(s)))
    .map((parts) => ({
      url: `https://standardebooks.org/${parts.join('/')}`,
      titleSlug: parts[2].replace(/-/g, ' '),
      translator: parts[3]?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
}

/* ---------- Project Gutenberg, from the catalogue file ---------- */

/** One CSV row, respecting quoted fields that contain commas. */
function csvRow(line: string) {
  const out: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

interface PGRow { id: number; title: string; authors: string; }

async function gutenbergCatalogue(): Promise<PGRow[]> {
  const path = '.cache/free/pg_catalog.csv';
  let csv: string | null = null;
  if (!fresh && existsSync(path)) csv = readFileSync(path, 'utf8');
  if (!csv) {
    console.log('Downloading the Project Gutenberg catalogue…');
    csv = (await get('https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv')) as string | null;
    if (!csv) throw new Error('Could not download the Gutenberg catalogue.');
    writeFileSync(path, csv);
  }
  const rows: PGRow[] = [];
  // Titles and author lists contain newlines inside quotes, so the file is walked rather
  // than split on line endings.
  let line = '', inQuotes = false;
  const push = (l: string) => {
    const f = csvRow(l);
    if (f.length < 6 || f[1] !== 'Text' || f[4] !== 'en') return;
    const id = Number(f[0]);
    if (id) rows.push({ id, title: f[3].replace(/\s+/g, ' ').trim(), authors: f[5] });
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') inQuotes = !inQuotes;
    if (c === '\n' && !inQuotes) { push(line); line = ''; } else if (c !== '\r') line += c;
  }
  if (line) push(line);
  return rows;
}

const pgAll = await gutenbergCatalogue();
console.log(`${pgAll.length} English texts in the Gutenberg catalogue\n`);

function pgForAuthor(w: (typeof candidates)[number]): PGHit[] {
  const surnames = surnamesOf(w.authorName, w.authorAliases);
  return pgAll
    .filter((r) => surnames.some((sn) => norm(r.authors).includes(sn)))
    .map((r) => ({ url: `https://www.gutenberg.org/ebooks/${r.id}`, id: r.id, title: r.title, downloads: 0 }));
}

/* ---------- run ---------- */

const out: Cand[] = [];
const authorIds = [...byAuthor.keys()];
let nextAuthor = 0;
let done = 0;

async function lane() {
  while (nextAuthor < authorIds.length) {
    const id = authorIds[nextAuthor++];
    const group = byAuthor.get(id)!;
    const [se, pg] = [await seForAuthor(group[0]).catch(() => []), pgForAuthor(group[0])];
    for (const w of group) {
      const mine = [w.title, ...w.aliases];
      let bestSE: Cand['se'];
      // Placeholders (books Standard Ebooks would like to make) carry no download. They
      // were filtered out of the author's page in seForAuthor, so every hit here is real.
      for (const h of se) {
        const s = titleScore(mine, h.titleSlug);
        if (s >= 0.75 && (!bestSE || s > bestSE.score)) bestSE = { ...h, score: s };
      }
      let bestPG: Cand['pg'];
      for (const h of pg) {
        const s = titleScore(mine, h.title);
        // Ties go to the lower Gutenberg number, which is usually the older, plainer,
        // single-work edition rather than a collected volume.
        if (s >= 0.75 && (!bestPG || s > bestPG.score || (s === bestPG.score && h.id < bestPG.id))) bestPG = { ...h, score: s };
      }
      out.push({
        slug: w.slug, title: w.title, authorName: w.authorName, year: w.year, language: w.language,
        se: bestSE, pg: bestPG, score: Math.max(bestSE?.score ?? 0, bestPG?.score ?? 0),
      });
      done++;
    }
    if (nextAuthor % 20 === 0) console.log(`  ${nextAuthor}/${authorIds.length} authors, ${done} works…`);
    await sleep(SLEEP);
  }
}
await Promise.all(Array.from({ length: LANES }, lane));
out.sort((a, b) => a.slug.localeCompare(b.slug));

writeFileSync('.cache/free-candidates.json', JSON.stringify(out, null, 2));

const found = out.filter((c) => c.se || c.pg);
console.log(`\n${found.length} of ${out.length} have a free source`);
console.log(`  Standard Ebooks:   ${out.filter((c) => c.se).length}`);
console.log(`  Gutenberg only:    ${out.filter((c) => !c.se && c.pg).length}`);
console.log(`  exact title match: ${found.filter((c) => c.score >= 0.999).length}`);
console.log('\nWritten to .cache/free-candidates.json. Next: npx tsx scripts/write-free.ts');
