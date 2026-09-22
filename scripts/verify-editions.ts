/**
 * Edition verification against Open Library.
 *
 * Two jobs, both conservative on purpose. A wrong ISBN sends a buyer to the wrong book,
 * which is worse than sending them to a search page, so this script would rather return
 * nothing than return a guess.
 *
 *   verify  every ISBN already in the content, against the real record for that ISBN
 *   find    an ISBN for a work that names a translator or publisher but has no ISBN
 *
 * Open Library is the source because its per-ISBN endpoint returns publisher, date and a
 * by_statement naming the translator. Google Books rate-limits anonymous callers.
 *
 *   npx tsx scripts/verify-editions.ts            report only
 *   npx tsx scripts/verify-editions.ts --apply    write accepted ISBNs into the content
 *   npx tsx scripts/verify-editions.ts --only <slug> [...]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';

const APPLY = process.argv.includes('--apply');
const ONLY = new Set(process.argv.filter((a, i) => process.argv[i - 1] === '--only'));
const CACHE_DIR = '.cache/openlibrary';
const UA = { 'User-Agent': 'greatbookslist.com edition verifier (hello@greatbookslist.com)' };
mkdirSync(CACHE_DIR, { recursive: true });

/** Reprint mills. Their editions carry no apparatus and are never what a programme assigns. */
const BLOCKED_PUBLISHER = /createspace|independently published|lulu|bibliolife|kessinger|dodo press|nabu|general books|book on demand|hardpress|palala|wentworth|sagwan|trieste|alpha edition|leopold classic|forgotten books|bibliobazaar|ulan press|arkose|scholar's choice|pranava|outlook verlag|anboco|e-artnow|sharp ink|good press|musaicum|digireads|simon & brown|value classic|tredition/i;

/** Publishers whose classics editions are the ones actually assigned. */
const TRUSTED_PUBLISHER = /penguin|oxford|hackett|norton|chicago|cambridge|yale|harvard|princeton|modern library|everyman|vintage|farrar|loeb|bantam|signet|dover|broadview|liberty fund|ignatius|catholic university|indiana university|johns hopkins|columbia university|university of|hutchinson|faber|macmillan|routledge|blackwell|wiley|随/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slugify = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 120);

async function cachedJson(url: string): Promise<any | null> {
  const file = `${CACHE_DIR}/${slugify(url)}.json`;
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8');
    return raw === 'null' ? null : JSON.parse(raw);
  }
  await sleep(1100); // Open Library is generous; do not abuse it.
  let out: any = null;
  try {
    const res = await fetch(url, { headers: UA });
    out = res.ok ? await res.json() : null;
  } catch { out = null; }
  writeFileSync(file, JSON.stringify(out));
  return out;
}

/** NFD first: a catalogue may store "Pense\u0301es" where we store "Pens\u00e9es", and stripping the
 *  combining mark makes both "pensees" instead of "pense s" and "pens es", which never matched. */
const norm = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const surname = (name?: string) => {
  if (!name) return '';
  const first = name.split(/\s+and\s+|,|&/)[0].trim();
  const parts = first.split(/\s+/).filter(Boolean);
  return norm(parts[parts.length - 1] ?? '');
};
const STOP = new Set(['the','a','an','of','on','and','or','to','in','by','with','vol','volume','works','complete','selected','book','books','new','edition']);
const tokens = (t: string) => norm(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
/**
 * Catalogue titles and our titles rarely match literally: "The Pickwick Papers" is filed as
 * "The posthumous papers of the Pickwick Club". Containment rejects that correct record, so
 * agreement is measured as shared significant words instead.
 */
const titleAgrees = (a: string, b: string) => {
  const [na, nb] = [norm(a), norm(b)];
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [x, y] = [tokens(a), tokens(b)];
  // "Selected Works" is entirely stopwords, so fall back to the normalised strings
  // rather than declaring a title that matches exactly to be a mismatch.
  if (!x.length || !y.length) return na.includes(nb) || nb.includes(na);
  const shared = x.filter((w) => y.includes(w)).length;
  return shared / Math.min(x.length, y.length) >= 0.5;
};

interface Work { slug: string; title: string; authorName: string; ed: any }

function readWorks(): Work[] {
  const authors = new Map<string, string>();
  for (const f of readdirSync('src/content/authors')) {
    if (!f.endsWith('.md')) continue;
    const m = readFileSync(`src/content/authors/${f}`, 'utf8').match(/^---\n([\s\S]*?)\n---/);
    if (m) authors.set(f.replace(/\.md$/, ''), parse(m[1]).name);
  }
  const out: Work[] = [];
  for (const f of readdirSync('src/content/works')) {
    if (!f.endsWith('.md')) continue;
    const slug = f.replace(/\.md$/, '');
    if (ONLY.size && !ONLY.has(slug)) continue;
    const m = readFileSync(`src/content/works/${f}`, 'utf8').match(/^---\n([\s\S]*?)\n---/);
    if (!m) continue;
    const d = parse(m[1]);
    out.push({ slug, title: d.title, authorName: authors.get(d.author) ?? d.author, ed: d.recommendedEdition ?? {} });
  }
  return out;
}

/** Confirm an ISBN is the book we claim it is. */
async function verifyIsbn(w: Work) {
  const isbn = w.ed.isbn13;
  const rec = await cachedJson(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!rec) return { slug: w.slug, isbn, status: 'unknown' as const, note: 'no record in Open Library' };
  const recTitle: string = [rec.title, rec.subtitle].filter(Boolean).join(': ');
  const by: string = rec.by_statement ?? '';
  const pubs: string = (rec.publishers ?? []).join(', ');
  const okTitle = titleAgrees(recTitle, w.title) || titleAgrees(recTitle, w.ed.title ?? '');
  const wantTr = surname(w.ed.translator);
  const okTr = !wantTr || norm(by).includes(wantTr) || norm(recTitle).includes(wantTr);
  const wantPub = norm(w.ed.publisher ?? '').split(' ')[0];
  const okPub = !wantPub || norm(pubs).includes(wantPub);
  if (BLOCKED_PUBLISHER.test(pubs)) return { slug: w.slug, isbn, status: 'bad' as const, note: `reprint mill: ${pubs}` };
  const omnibus = /complete works|collected works|selected works|complete plays|reader|anthology/i.test(recTitle);
  if (!okTitle && omnibus && (okTr || okPub)) {
    return { slug: w.slug, isbn, status: 'ok' as const, note: `${recTitle} (${pubs}) — omnibus containing this work` };
  }
  if (!okTitle) return { slug: w.slug, isbn, status: 'bad' as const, note: `resolves to "${recTitle}" not "${w.title}"` };
  if (!okTr && !okPub) return { slug: w.slug, isbn, status: 'suspect' as const, note: `is "${recTitle}" (${pubs}) ${by ? '| ' + by.slice(0, 60) : ''}` };
  return { slug: w.slug, isbn, status: 'ok' as const, note: `${recTitle} (${pubs})` };
}

/** Look for the specific edition the work already names. Returns nothing unless confident. */
async function findIsbn(w: Work) {
  const search = await cachedJson(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(w.title)}&author=${encodeURIComponent(w.authorName)}&fields=key,title&limit=1`,
  );
  const key = search?.docs?.[0]?.key;
  if (!key) return { slug: w.slug, status: 'none' as const, note: 'no work found' };
  const eds = await cachedJson(`https://openlibrary.org${key}/editions.json?limit=100`);
  const entries: any[] = eds?.entries ?? [];

  const wantTr = surname(w.ed.translator);
  const wantPub = norm(w.ed.publisher ?? '').split(' ').filter((t) => t.length > 3)[0] ?? '';

  let best: { isbn: string; score: number; why: string } | null = null;
  for (const e of entries) {
    const isbn = (e.isbn_13 ?? []).find((i: string) => /^978/.test(i));
    if (!isbn) continue; // 979 has no ISBN-10, so no direct Amazon product link
    const pubs = (e.publishers ?? []).join(', ');
    const by = e.by_statement ?? '';
    const langs = (e.languages ?? []).map((l: any) => l.key).join(',');
    if (langs && !langs.includes('eng')) continue;
    if (BLOCKED_PUBLISHER.test(pubs)) continue;
    if (!titleAgrees(e.title ?? '', w.title)) continue;

    let score = 0;
    const why: string[] = [];
    if (wantPub && norm(pubs).includes(wantPub)) { score += 6; why.push('publisher'); }
    if (wantTr && (norm(by).includes(wantTr) || norm(e.title ?? '').includes(wantTr))) { score += 6; why.push('translator'); }
    if (TRUSTED_PUBLISHER.test(pubs)) { score += 2; why.push('trusted'); }
    if (score === 0) continue;
    if (!best || score > best.score) best = { isbn, score, why: `${why.join('+')} · ${pubs}` };
  }
  // Publisher or translator alone is thin; require one strong signal plus a real publisher.
  if (!best || best.score < 8) return { slug: w.slug, status: 'none' as const, note: best ? `only weak matches (${best.why})` : 'no acceptable edition' };
  return { slug: w.slug, status: 'found' as const, isbn: best.isbn, note: best.why };
}

function applyIsbn(slug: string, isbn: string) {
  const file = `src/content/works/${slug}.md`;
  const src = readFileSync(file, 'utf8');
  if (/^\s{2}isbn13:/m.test(src)) return false;
  // Insert into the existing recommendedEdition block, after its last simple key.
  const out = src.replace(
    /(^recommendedEdition:\n(?:[ \t]+.*\n)*?)((?=^[a-zA-Z]|^---))/m,
    (_m, block: string, tail: string) => `${block}  isbn13: "${isbn}"\n${tail}`,
  );
  if (out === src) return false;
  writeFileSync(file, out);
  return true;
}

async function main() {
  const works = readWorks();
  const toVerify = works.filter((w) => w.ed.isbn13);
  const toFind = works.filter((w) => !w.ed.isbn13 && (w.ed.translator || w.ed.publisher));
  console.log(`${works.length} works · verifying ${toVerify.length} existing ISBNs · searching for ${toFind.length}\n`);

  const bad: any[] = [], suspect: any[] = [], unknown: any[] = [];
  let ok = 0, n = 0;
  for (const w of toVerify) {
    const r = await verifyIsbn(w);
    n++;
    if (n % 50 === 0) console.log(`  …verified ${n}/${toVerify.length}`);
    if (r.status === 'ok') ok++;
    else if (r.status === 'bad') bad.push(r);
    else if (r.status === 'suspect') suspect.push(r);
    else unknown.push(r);
  }
  const byIsbn = new Map<string, string[]>();
  for (const w of toVerify) byIsbn.set(w.ed.isbn13, [...(byIsbn.get(w.ed.isbn13) ?? []), w.slug]);
  const shared = [...byIsbn.entries()].filter(([, slugs]) => slugs.length > 1);

  console.log(`\nVERIFY: ${ok} confirmed · ${bad.length} wrong · ${suspect.length} suspect · ${unknown.length} not in Open Library`);
  if (shared.length) {
    console.log(`\nONE ISBN, MANY WORKS (an omnibus standing in for separate titles):`);
    for (const [isbn, slugs] of shared) console.log(`  ${isbn} used by ${slugs.length}: ${slugs.join(', ')}`);
  }
  for (const r of bad) console.log(`  WRONG   ${r.slug}  ${r.isbn}  ${r.note}`);
  for (const r of suspect.slice(0, 25)) console.log(`  suspect ${r.slug}  ${r.isbn}  ${r.note}`);

  const found: any[] = [], none: any[] = [];
  n = 0;
  for (const w of toFind) {
    const r = await findIsbn(w);
    n++;
    if (n % 50 === 0) console.log(`  …searched ${n}/${toFind.length}`);
    (r.status === 'found' ? found : none).push(r);
  }
  console.log(`\nFIND: ${found.length} confident matches · ${none.length} left without one`);
  for (const r of found.slice(0, 30)) console.log(`  + ${r.slug}  ${r.isbn}  ${r.note}`);

  if (APPLY) {
    let wrote = 0;
    for (const r of found) if (applyIsbn(r.slug, r.isbn)) wrote++;
    let cleared = 0;
    for (const r of bad) {
      const file = `src/content/works/${r.slug}.md`;
      const src = readFileSync(file, 'utf8');
      const out = src.replace(new RegExp(`^\\s{2}isbn13: "?${r.isbn}"?\\n`, 'm'), '');
      if (out !== src) { writeFileSync(file, out); cleared++; }
    }
    console.log(`\nAPPLIED: ${wrote} ISBNs written · ${cleared} wrong ISBNs removed`);
  } else {
    console.log('\nReport only. Re-run with --apply to write these into the content.');
  }
}
main();
