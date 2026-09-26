/**
 * Fills in the missing ISBN on works that already name a recommended edition.
 *
 * The editorial decision is already made in the content: 430 works name a title, a
 * translator, a publisher and a year but carry no ISBN, so their buy button opens an
 * Amazon search rather than the book. This does not choose an edition. It looks up the one
 * already chosen and records its number.
 *
 * That distinction is the whole safety argument. An open search for "Prometheus Bound"
 * returns study guides, print-on-demand reprints and the wrong translation; a search for
 * "Aeschylus II, University of Chicago Press, 2013" returns one book. Everything below is
 * built to refuse rather than to guess: a candidate has to match on title and publisher and
 * land near the right year, and anything short of that is reported for a human instead of
 * being written.
 *
 *   npx tsx scripts/find-editions.ts             # dry run, prints what it would do
 *   npx tsx scripts/find-editions.ts --write     # applies the accepted matches
 *   npx tsx scripts/find-editions.ts --only aesop-fables --verbose
 *
 * Every response is cached under .cache/gbooks, so a re-run costs no quota and an
 * interrupted run resumes where it stopped. The Books API allows roughly a thousand calls
 * a day and this needs one per work.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const KEY = (() => {
  for (const line of existsSync('.env') ? readFileSync('.env', 'utf8').split('\n') : []) {
    const m = /^\s*GOOGLE_BOOKS_API_KEY\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env.GOOGLE_BOOKS_API_KEY ?? '';
})();
if (!KEY) throw new Error('GOOGLE_BOOKS_API_KEY is not set. Put it in .env.');

const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');
const ONLY = new Set(process.argv.filter((_, i) => process.argv[i - 1] === '--only'));
const DIR = 'src/content/works';
const CACHE = '.cache/gbooks';
mkdirSync(CACHE, { recursive: true });

/* ---------------------------------------------------------------- text helpers */

/** Compare without accents, case, punctuation or articles, which vary between records. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'to', 'with', 'by', 'vol', 'volume']);
const words = (s: string) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** Share of the shorter phrase's words that appear in the longer one. */
function overlap(a: string, b: string): number {
  const x = words(a), y = new Set(words(b));
  if (!x.length) return 0;
  const hit = x.filter((w) => y.has(w)).length;
  return hit / x.length;
}

/** An ISBN-13 is only worth recording if its check digit is right. */
function validIsbn13(s: string): boolean {
  const d = s.replace(/[^0-9]/g, '');
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

/* ---------------------------------------------------------------- frontmatter */

interface Edition { title?: string; translator?: string; publisher?: string; year?: string; isbn13?: string }
interface Work { slug: string; file: string; title: string; author: string; ed: Edition; block: string; blockStart: number; blockEnd: number }

const frontmatter = (s: string) => /^---\n([\s\S]*?)\n---/.exec(s)?.[1] ?? '';

/** Locate the recommendedEdition block and its exact line range, so a write is surgical. */
function readWork(file: string): Work | null {
  const raw = readFileSync(`${DIR}/${file}`, 'utf8');
  const fmText = frontmatter(raw);
  if (!fmText) return null;
  const lines = raw.split('\n');
  const start = lines.findIndex((l) => /^recommendedEdition:\s*$/.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && /^[ \t]/.test(lines[end]) && lines[end].trim() !== '') end++;
  const block = lines.slice(start + 1, end).join('\n');
  const f = (k: string) => new RegExp(`^\\s+${k}:\\s*(.+)$`, 'm').exec(block)?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
  return {
    slug: file.replace(/\.md$/, ''),
    file,
    title: new RegExp('^title:\\s*(.+)$', 'm').exec(fmText)?.[1].trim().replace(/^["']|["']$/g, '') ?? '',
    author: new RegExp('^author:\\s*(.+)$', 'm').exec(fmText)?.[1].trim() ?? '',
    ed: { title: f('title'), translator: f('translator'), publisher: f('publisher'), year: f('year'), isbn13: f('isbn13') },
    block, blockStart: start + 1, blockEnd: end,
  };
}

/**
 * Author display names, keyed by the slug a work points at.
 *
 * Needed because a title alone is not evidence when the title is a common word. Porphyry's
 * Isagoge is published as "Introduction", which matched "An introduction to political
 * philosophy" at full confidence. The author is what separates them.
 */
const AUTHORS: Record<string, string> = {};
for (const f of readdirSync('src/content/authors').filter((f) => f.endsWith('.md'))) {
  const m = /^name:\s*(.+)$/m.exec(frontmatter(readFileSync(`src/content/authors/${f}`, 'utf8')));
  if (m) AUTHORS[f.replace(/\.md$/, '')] = m[1].trim().replace(/^["']|["']$/g, '');
}

/* ---------------------------------------------------------------- the lookup */

interface Volume {
  title?: string; subtitle?: string; authors?: string[]; publisher?: string;
  publishedDate?: string; printType?: string; pageCount?: number; language?: string;
  industryIdentifiers?: { type: string; identifier: string }[];
}

async function books(q: string, attempt = 0): Promise<Volume[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books&country=US&key=${KEY}`;
  const res = await fetch(url);
  /* A 429 is usually the per-minute limit, not the day's quota: from a shared egress it
     arrived after sixty calls, with the daily thousand nowhere near spent. Back off three
     times before concluding the day is done. */
  if (res.status === 429) {
    if (attempt < 3) { await new Promise((r) => setTimeout(r, 8000 * 2 ** attempt)); return books(q, attempt + 1); }
    throw new Error('QUOTA');
  }
  if (!res.ok) throw new Error(`Books API ${res.status}`);
  const j = await res.json() as { items?: { volumeInfo: Volume }[] };
  return (j.items ?? []).map((i) => i.volumeInfo);
}

async function cachedSearch(slug: string, q: string): Promise<Volume[]> {
  const path = `${CACHE}/${slug}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const out = await books(q);
  writeFileSync(path, JSON.stringify(out));
  await new Promise((r) => setTimeout(r, 220));   // stay well inside the per-second limit
  return out;
}

/**
 * Open Library, asked a second time about the same number.
 *
 * Google indexes the ebook of a title alongside the paperback, and both carry a valid
 * ISBN-13, so the two are indistinguishable on the Books record alone. Amazon's /dp/ path
 * wants the print one. Open Library is a catalogue of physical editions: it redirects to an
 * edition page for a printed book and returns 404 for an ebook-only ISBN, which separates
 * the pair. It does not know every real book, so a miss here is a reason to prefer another
 * candidate, never on its own a reason to reject one.
 */
const OL_CACHE = '.cache/openlibrary-isbn.json';
const olSeen: Record<string, string | null> = existsSync(OL_CACHE) ? JSON.parse(readFileSync(OL_CACHE, 'utf8')) : {};

/** The title Open Library files that ISBN under, or null if it does not know the number. */
async function olTitle(isbn: string): Promise<string | null> {
  if (isbn in olSeen) return olSeen[isbn];
  let title: string | null = null;
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { headers: { 'User-Agent': 'greatbookslist.com edition lookup' } });
    if (res.ok) {
      const d = await res.json() as { title?: string };
      title = typeof d.title === 'string' ? d.title : '';
    }
  } catch {
    /* Could not reach the catalogue at all: that is not an answer about this number, and
       remembering it as one would leave the ISBN marked unknown for every later run. From
       an environment that denies openlibrary.org this had cached "unknown" for all of them. */
    return null;
  }
  olSeen[isbn] = title;
  writeFileSync(OL_CACHE, JSON.stringify(olSeen));
  await new Promise((r) => setTimeout(r, 260));
  return title;
}

/**
 * Confirming a number exists is not the same as confirming it is the right book, and the
 * difference showed up as soon as the matches were sampled: Troilus and Criseyde resolved
 * to "Oxford Guides to Chaucer" and a Hazlitt essay to a book called "Karl Marx". Both
 * numbers are real printed books, which is all the first version of this check asked.
 * So the catalogue is asked what the number is, and the answer has to agree with what we
 * were looking for before it counts as confirmation.
 */
async function inPrint(isbn: string, expect: string[]): Promise<boolean> {
  const t = await olTitle(isbn);
  if (t === null) return false;
  if (t === '') return true;   // catalogued, but with no title to compare
  return expect.some((e) => overlap(e, t) >= 0.6 || overlap(t, e) >= 0.6);
}

/**
 * Publishers are written one way in the content and another in Google's records: an
 * edition filed here as "Oxford World's Classics" comes back as "OUP Oxford". Both sides
 * are reduced to a single house token so they can be compared at all.
 */
const HOUSE: [RegExp, string][] = [
  [/\boup\b|oxford/, 'oxford'],
  [/cambridge/, 'cambridge'],
  [/penguin/, 'penguin'],
  [/\bhackett\b/, 'hackett'],
  [/norton/, 'norton'],
  [/chicago/, 'chicago'],
  [/harvard|loeb/, 'harvard'],
  [/yale/, 'yale'],
  [/princeton/, 'princeton'],
  [/modern library|random house|knopf|vintage|pantheon/, 'randomhouse'],
  [/everyman/, 'everyman'],
  [/\bdover\b/, 'dover'],
  [/macmillan|farrar|picador/, 'macmillan'],
  [/harper/, 'harper'],
  [/simon *& *schuster|scribner/, 'simonschuster'],
  [/routledge|taylor *& *francis/, 'routledge'],
  [/blackwell|wiley/, 'wiley'],
  [/brill/, 'brill'],
  [/cornell/, 'cornell'],
  [/columbia/, 'columbia'],
  [/indiana university/, 'indiana'],
  [/st *martin/, 'stmartins'],
  [/bloomsbury|continuum/, 'bloomsbury'],
  [/britannica/, 'britannica'],
];
function house(p: string): string {
  const n = norm(p);
  for (const [re, name] of HOUSE) if (re.test(n)) return name;
  return n;
}

/**
 * Houses that exist to reprint public-domain scans on demand. Their books carry real
 * ISBNs and real titles, so they score well on paper and are exactly the wrong thing to
 * send a reader to: a photographed 1910 page, often missing plates, sometimes missing
 * chapters. They are the only sellers of some of the Harvard Classics volumes this site
 * assigns, which is precisely why the match has to be refused rather than ranked.
 */
const REPRINT_MILL = /createspace|independently published|legare street|franklin classics|forgotten books|palala|wentworth press|kessinger|nabu press|sagwan|trieste publishing|hansebooks|bookrix|floating press|bibliobazaar|scholar's choice|andesite|arkose|rarebooksclub|lulu\.com|outlook verlag|pinnacle press|facsimile publisher/i;

/** Anything whose title says it is about the book rather than being the book. */
const ABOUT = /\b(study guide|sparknotes|cliffsnotes|summary of|companion to|guides? (to|for)|a guide|handbook to|introduction to the|workbook|analysis of|coloring|quiz|notes on|casebook|critical essays on|reader's guide)\b/i;

interface Scored { isbn13: string; score: number; why: string[]; vol: Volume }

function score(w: Work, v: Volume): Scored | null {
  const isbn = v.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? '';
  if (!isbn || !validIsbn13(isbn)) return null;
  if (v.printType && v.printType !== 'BOOK') return null;   // the API returns BOOK, singular
  const full = [v.title, v.subtitle].filter(Boolean).join(': ');
  if (ABOUT.test(full)) return null;
  if (v.publisher && REPRINT_MILL.test(v.publisher)) return null;
  /*
   * Every edition this site recommends is an English one, and a title matches across
   * languages: an Italian monograph about Leo XIII's Aeterni Patris carries those two words
   * and scored 70 against the encyclical itself. Books about a work, in the language of the
   * work's scholarship, are the most convincing wrong answers this search produces.
   */
  if (v.language && v.language !== 'en') return null;

  const why: string[] = [];
  let s = 0;

  // Title. The edition's own title is the strongest signal; the work's title is a fallback
  // for anthologies, where the edition is called something else entirely.
  const tEd = overlap(w.ed.title || w.title, full);
  const tWork = overlap(w.title, full);
  const t = Math.max(tEd, tWork);
  if (t < 0.6) return null;
  s += t * 45; why.push(`title ${(t * 100) | 0}%`);

  // Publisher. Weighted heavily, because it is what separates the assigned edition from
  // the dozen reprints of the same text.
  if (w.ed.publisher && v.publisher) {
    const a = house(w.ed.publisher), b = house(v.publisher);
    const p = a === b ? 1 : overlap(a, b);
    s += p * 30;
    if (p >= 0.5) why.push(p === 1 ? `publisher ${a}` : `publisher ${(p * 100) | 0}%`);
  } else if (w.ed.publisher && !v.publisher) {
    // A record with no publisher at all is usually a library catalogue stub, not an edition.
    s -= 8; why.push('no publisher on record');
  }

  /*
   * Author. A volume that lists contributors and lists neither this work's author nor its
   * translator among them is almost always a different book that happens to share words
   * with the title, and the shorter the title the more often that happens.
   */
  const author = AUTHORS[w.author] ?? '';
  if (author && v.authors?.length) {
    const hit = v.authors.some((a) => overlap(author, a) >= 0.5 || overlap(a, author) >= 0.5);
    if (hit) { s += 14; why.push('author named'); }
    else if (words(w.ed.title || w.title).length <= 2) return null;   // generic title, wrong author
    else { s -= 16; why.push('author absent'); }
  }

  // Translator, when the record happens to list them as a contributor.
  if (w.ed.translator && v.authors?.length) {
    const tr = Math.max(...v.authors.map((a) => overlap(w.ed.translator!, a)));
    if (tr >= 0.5) { s += 15; why.push('translator named'); }
  }

  // Year. Editions are reissued, so nearby is fine and far away is suspicious.
  const vy = Number(v.publishedDate?.slice(0, 4));
  const ey = Number(w.ed.year);
  if (vy && ey) {
    const gap = Math.abs(vy - ey);
    if (gap === 0) { s += 12; why.push('exact year'); }
    else if (gap <= 3) { s += 7; why.push(`year ±${gap}`); }
    else if (gap > 15) { s -= 10; why.push(`year off by ${gap}`); }
  }

  // A 978 prefix converts to an ISBN-10, which is what makes a direct Amazon link possible.
  if (isbn.startsWith('978')) { s += 5; why.push('links direct'); }

  return { isbn13: isbn, score: s, why, vol: v };
}

/* ---------------------------------------------------------------- run */

const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const targets = files
  .map(readWork)
  .filter((w): w is Work => !!w && !w.ed.isbn13 && !!(w.ed.title || w.ed.publisher))
  .filter((w) => !ONLY.size || ONLY.has(w.slug));

/*
 * Two bars, not one.
 *
 * Google indexes the ebook next to the paperback and both carry a valid ISBN-13, so a
 * candidate that Open Library cannot find is a candidate that might be a digital-only
 * number, which Amazon's /dp/ path will not resolve. Where a catalogue of physical books
 * confirms the number, ordinary agreement on title and publisher is enough. Where it does
 * not, the match has to be strong enough to stand on the Google record alone.
 */
const ACCEPT = 62;
const ACCEPT_UNCONFIRMED = 95;
const bar = (m: Scored) => (m.why.includes('in print catalogue') ? ACCEPT : ACCEPT_UNCONFIRMED);
const accepted: { w: Work; m: Scored }[] = [];
const rejected: { w: Work; best?: Scored; reason: string }[] = [];
let quotaHit = false;

for (const w of targets) {
  const q = [
    `intitle:"${(w.ed.title || w.title).replace(/"/g, '')}"`,
    w.ed.publisher ? `inpublisher:"${w.ed.publisher.replace(/"/g, '')}"` : '',
  ].filter(Boolean).join(' ');

  let vols: Volume[];
  try {
    vols = await cachedSearch(w.slug, q);
    // A publisher written as an imprint, like "Oxford World's Classics", is not how Google
    // files it, and the restriction then returns nothing at all rather than the wrong book.
    if (!vols.length && w.ed.publisher) vols = await cachedSearch(`${w.slug}--noimprint`, `intitle:"${(w.ed.title || w.title).replace(/"/g, '')}"`);
  }
  catch (e) {
    if ((e as Error).message === 'QUOTA') { quotaHit = true; break; }
    rejected.push({ w, reason: `lookup failed: ${(e as Error).message}` });
    continue;
  }

  const ranked = vols.map((v) => score(w, v)).filter((x): x is Scored => !!x).sort((a, b) => b.score - a.score);
  // Among the plausible ones, prefer the number a catalogue of physical books recognises.
  const expect = [w.ed.title || w.title, w.title].filter(Boolean) as string[];
  for (const c of ranked.slice(0, 4)) {
    if (c.score < ACCEPT) break;
    if (await inPrint(c.isbn13, expect)) { c.score += 20; c.why.push('in print catalogue'); break; }
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (VERBOSE) {
    console.log(`\n${w.slug}  ${q}`);
    ranked.slice(0, 4).forEach((r) => console.log(`   ${r.score.toFixed(0).padStart(3)}  ${r.isbn13}  ${(r.vol.title ?? '').slice(0, 48).padEnd(48)} ${(r.vol.publisher ?? '').slice(0, 24)}  [${r.why.join(', ')}]`));
  }
  if (!best) rejected.push({ w, reason: vols.length ? `${vols.length} results, none matched` : 'no results' });
  else if (best.score < bar(best)) rejected.push({ w, best, reason: `score ${best.score.toFixed(0)} below ${bar(best)}${bar(best) === ACCEPT_UNCONFIRMED ? ', unconfirmed in print' : ''}` });
  else accepted.push({ w, m: best });
}

/* ---------------------------------------------------------------- report & write */

console.log(`\n${targets.length} works needed an ISBN`);
console.log(`  accepted ${accepted.length}`);
console.log(`  left for review ${rejected.length}`);
if (quotaHit) console.log('  stopped early: daily quota reached. Re-run tomorrow; cached work is kept.');

const dupes = new Map<string, string[]>();
for (const { w, m } of accepted) dupes.set(m.isbn13, [...(dupes.get(m.isbn13) ?? []), w.slug]);
const shared = [...dupes].filter(([, s]) => s.length > 1);
if (shared.length) {
  console.log(`\n  ${shared.length} ISBNs matched more than one work, which is right for an anthology and wrong otherwise:`);
  for (const [isbn, slugs] of shared.slice(0, 12)) console.log(`    ${isbn}  ${slugs.join(', ')}`);
}

writeFileSync('.cache/find-editions-report.txt',
  ['ACCEPTED', ...accepted.map(({ w, m }) => `${m.score.toFixed(0).padStart(3)}  ${w.slug.padEnd(34)} ${m.isbn13}  ${(m.vol.title ?? '').slice(0, 50)}  [${m.why.join(', ')}]`),
    '', 'FOR REVIEW', ...rejected.map(({ w, best, reason }) => `     ${w.slug.padEnd(34)} ${reason}${best ? `  (best: ${best.isbn13} ${(best.vol.title ?? '').slice(0, 40)})` : ''}`)].join('\n'));
console.log('\n  full report: .cache/find-editions-report.txt');

if (!WRITE) { console.log('\nDry run. Pass --write to apply the accepted matches.'); process.exit(0); }

for (const { w, m } of accepted) {
  const raw = readFileSync(`${DIR}/${w.file}`, 'utf8');
  const lines = raw.split('\n');
  const indent = /^(\s+)/.exec(lines[w.blockStart])?.[1] ?? '  ';
  // Appended as the block's last key so nothing already written is touched or reordered.
  lines.splice(w.blockEnd, 0, `${indent}isbn13: "${m.isbn13}"`);
  writeFileSync(`${DIR}/${w.file}`, lines.join('\n'));
}
console.log(`\nWrote ${accepted.length} ISBNs. Run npm run validate:content, then npm run build.`);
