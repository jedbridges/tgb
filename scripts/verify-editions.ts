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
 * A found ISBN has to agree with the edition the guide names on every field the guide
 * gives: the title, the publisher (the house or its series), every translator, and the
 * year. It must be a print edition, and its record's author must be the guide's author.
 * Each of those rules is there because a looser version let a wrong book through: a
 * publisher match alone picked another translation from the same house, a search on an
 * edition's title alone ("Selected Poems") returned another poet's book, and ebook ISBNs
 * make Amazon links that land on nothing.
 *
 *   npx tsx scripts/verify-editions.ts            report only
 *   npx tsx scripts/verify-editions.ts --apply    write accepted ISBNs into the content
 *   npx tsx scripts/verify-editions.ts --only <slug> [...]
 *   npx tsx scripts/verify-editions.ts --checklist         also write reports/edition-checklist.md
 *   npx tsx scripts/verify-editions.ts --apply-checklist   write only the rows ticked accept
 *
 * The checklist turns each near miss into a row a person can settle by eye: the edition the
 * guide names, the candidate's catalogue record, and plain product links (no affiliate tag)
 * to check it against the retailer's own page. It lives in reports/, which is gitignored.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';

const APPLY = process.argv.includes('--apply');
const CHECKLIST = process.argv.includes('--checklist');
const APPLY_CHECKLIST = process.argv.includes('--apply-checklist');
const CHECKLIST_FILE = 'reports/edition-checklist.md';
const ONLY = new Set(process.argv.filter((a, i) => process.argv[i - 1] === '--only'));
const CACHE_DIR = '.cache/openlibrary';
const UA = { 'User-Agent': 'greatbookslist.com edition verifier (hello@greatbookslist.com)' };
mkdirSync(CACHE_DIR, { recursive: true });

/** Reprint mills. Their editions carry no apparatus and are never what a programme assigns. */
const BLOCKED_PUBLISHER = /createspace|independently published|lulu|bibliolife|kessinger|dodo press|nabu|general books|book on demand|hardpress|palala|wentworth|sagwan|trieste|alpha edition|leopold classic|forgotten books|bibliobazaar|ulan press|arkose|scholar's choice|pranava|outlook verlag|anboco|e-artnow|sharp ink|good press|musaicum|digireads|simon & brown|value classic|tredition|creative media partners|start publishing/i;

/** Formats that cannot be the paperback a reader is sent to buy. */
const NOT_PRINT = /e-?book|electronic|kindle|digital|audio|online|epub|pdf/i;


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

/** Words that appear in every publisher's name and so prove nothing on their own. */
const GENERIC = new Set(['university', 'press', 'books', 'book', 'publishing', 'publishers', 'publisher',
  'company', 'inc', 'co', 'ltd', 'house', 'the', 'of', 'and', 'group', 'classics', 'classic', 'editions',
  'edition', 'paperbacks', 'paperback', 'publications', 'international', 'usa', 'us', 'uk', 'new', 'york', 'london']);
/**
 * "Oxford University Press (Oxford World's Classics)" names a house and its series, and a
 * catalogue usually records only the house. Either part agreeing is enough, but every
 * distinctive word of that part must be present: "Norton" alone does not make "Penguin".
 */
const publisherAgrees = (want: string, pubs: string) => {
  const have = norm(pubs).split(' ');
  return want.split(/[(),]/).map((x) => x.trim()).filter(Boolean).some((part) => {
    const t = norm(part).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w));
    return t.length ? t.every((w) => have.includes(w)) : norm(pubs).includes(norm(part));
  });
};
/** Every translator's surname, not only the first: "Pevear and Volokhonsky" needs both. */
const surnames = (name?: string) => (name ?? '').split(/\s*(?:,|&|\band\b|revised by|with)\s*/i)
  .map((n) => n.trim().split(/\s+/).filter(Boolean)).filter((p) => p.length)
  .map((p) => norm(p[p.length - 1])).filter((s) => s.length > 1 && !['jr', 'sr', 'ed', 'eds', 'trans'].includes(s));
const translatorsAgree = (want: string | undefined, rec: any) => {
  const need = surnames(want);
  if (!need.length) return true;
  const said = norm([rec.by_statement ?? '', rec.title ?? '', ...(rec.contributors ?? []).map((c: any) => c.name ?? '')].join(' ')).split(' ');
  return need.every((s) => said.includes(s));
};
/** An ISBN-10 or a stated print binding. Ebook records usually have neither, and a format
 *  left blank is not evidence of a paperback. */
const printEvidence = (rec: any) => (rec.isbn_10 ?? []).length > 0 || /paper|hard|cloth|mass market|trade/i.test(rec.physical_format ?? '');
/** "My Antonia / O Pioneers!" agrees with "My Antonia" word for word and is still another book. */
const combinedVolume = (recTitle: string, wantTitle: string) => /\s\/\s|;\s/.test(recTitle) && !/\s\/\s|;\s/.test(wantTitle);
/** The reverse case: the guide names "The School for Scandal and Other Plays" and the record
 *  is the single play. Every word of the shorter title is in the longer one, so the plain
 *  title check passes it; a collection word the guide uses has to be in the record too. */
const COLLECTION = ['other', 'selected', 'collected', 'complete', 'plays', 'poems', 'stories', 'tales', 'writings', 'essays', 'works', 'letters'];
const collectionMismatch = (recTitle: string, wantTitle: string) => {
  const have = norm(recTitle).split(' ');
  return norm(wantTitle).split(' ').some((w) => COLLECTION.includes(w) && !have.includes(w));
};
/**
 * ISBN prefixes for houses whose numbers come from a few stable blocks. A catalogue can name
 * the wrong publisher (Open Library files an Edinburgh University Press number under Yale),
 * so when the guide names one of these houses the ISBN has to carry one of its prefixes.
 * The list only refuses: a house not listed here is not checked.
 */
const HOUSE_PREFIXES: [RegExp, string[]][] = [
  [/\byale\b/i, ['978030']],
  [/\bnorton\b/i, ['978039', '9781324']],
  [/\boxford\b/i, ['978019']],
  [/\bdover\b/i, ['978048']],
  [/\bchicago\b/i, ['978022']],
  [/\bharvard\b|\bloeb\b/i, ['978067']],
  [/\bprinceton\b/i, ['978069']],
  [/\bhackett\b/i, ['978087220', '978160384', '978162466']],
  [/\bedinburgh\b/i, ['9780748', '9781474']],
];
const prefixAgrees = (isbn: string, publisher?: string) => {
  const rules = HOUSE_PREFIXES.filter(([house]) => house.test(publisher ?? ''));
  return !rules.length || rules.some(([, prefixes]) => prefixes.some((p) => isbn.startsWith(p)));
};
const yearOf = (s?: unknown) => (String(s ?? '').match(/\b(1[5-9]\d\d|20\d\d)\b/) ?? [])[1];

/** The record's author has to be the guide's author. An edition-title search can return
 *  any writer's "Selected Poems"; this is the check that catches it. */
async function authorAgrees(rec: any, authorName: string): Promise<boolean> {
  let keys: string[] = (rec.authors ?? []).map((a: any) => a.key);
  if (!keys.length && rec.works?.[0]) {
    const work = await cachedJson(`https://openlibrary.org${rec.works[0].key}.json`);
    keys = (work?.authors ?? []).map((a: any) => a.author?.key).filter(Boolean);
  }
  const want = norm(authorName).split(' ').filter((t) => t.length > 2);
  const last = want[want.length - 1];
  if (!last) return false;
  for (const k of keys) {
    const a = await cachedJson(`https://openlibrary.org${k}.json`);
    if (a?.name && norm(a.name).split(' ').includes(last)) return true;
  }
  return false;
}

/** The catalogue record behind a near miss, kept so the checklist can show it. */
interface Candidate { isbn: string; title: string; publishers: string; year: string; by: string; format: string }
const candidateOf = (isbn: string, rec: any): Candidate => ({
  isbn,
  title: [rec.title, rec.subtitle].filter(Boolean).join(': '),
  publishers: (rec.publishers ?? []).join(', '),
  year: yearOf(rec.publish_date) ?? '?',
  by: rec.by_statement ?? '',
  format: rec.physical_format ?? '',
});

/** ISBN-10 for a 978 ISBN-13: Amazon's /dp/ pages are keyed on it. */
function isbn10Of(isbn13: string): string {
  const body = isbn13.slice(3, 12);
  const sum = [...body].reduce((t, d, i) => t + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? 'X' : String(check));
}

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
  const okTr = translatorsAgree(w.ed.translator, rec);
  const okPub = !w.ed.publisher || publisherAgrees(w.ed.publisher, pubs);
  if (BLOCKED_PUBLISHER.test(pubs)) return { slug: w.slug, isbn, status: 'bad' as const, note: `reprint mill: ${pubs}` };
  if (NOT_PRINT.test(rec.physical_format ?? '')) {
    return { slug: w.slug, isbn, status: 'suspect' as const, note: `an ${rec.physical_format} record, not a print edition (${pubs})` };
  }
  const omnibus = /complete works|collected works|selected works|complete plays|reader|anthology/i.test(recTitle);
  if (!okTitle && omnibus && (okTr || okPub)) {
    return { slug: w.slug, isbn, status: 'ok' as const, note: `${recTitle} (${pubs}), an omnibus containing this work` };
  }
  if (!okTitle) return { slug: w.slug, isbn, status: 'bad' as const, note: `resolves to "${recTitle}" not "${w.title}"` };
  if (!okTr && !okPub) return { slug: w.slug, isbn, status: 'suspect' as const, note: `is "${recTitle}" (${pubs}) ${by ? '| ' + by.slice(0, 60) : ''}` };
  return { slug: w.slug, isbn, status: 'ok' as const, note: `${recTitle} (${pubs})` };
}

/** Look for the specific edition the work already names. Returns nothing unless every field
 *  the guide gives agrees, and says which field failed when it does not. */
async function findIsbn(w: Work) {
  // The work's own title finds its editions; an anthology the guide names (a Bible book
  // recommended in a complete Bible) is a different catalogue work, found by its title.
  const queries = [`title=${encodeURIComponent(w.title)}&author=${encodeURIComponent(w.authorName)}`];
  if (w.ed.title && !titleAgrees(w.ed.title, w.title)) queries.push(`title=${encodeURIComponent(w.ed.title)}`);
  const keys = new Set<string>();
  for (const q of queries) {
    const s = await cachedJson(`https://openlibrary.org/search.json?${q}&fields=key,title&limit=3`);
    for (const d of s?.docs ?? []) keys.add(d.key);
  }
  if (!keys.size) return { slug: w.slug, status: 'none' as const, note: 'no work found' };
  const entries: any[] = [];
  for (const key of keys) {
    for (let offset = 0; offset < 300; offset += 100) {
      const page = await cachedJson(`https://openlibrary.org${key}/editions.json?limit=100&offset=${offset}`);
      const got = page?.entries ?? [];
      entries.push(...got);
      if (got.length < 100) break;
    }
  }

  const wantYear = w.ed.year ? String(w.ed.year) : '';
  const matches: { isbn: string; paper: boolean }[] = [];
  let nearest = '';
  let cand: Candidate | undefined;
  for (const e of entries) {
    const isbn = (e.isbn_13 ?? []).find((i: string) => /^978/.test(i));
    if (!isbn) continue; // 979 has no ISBN-10, so no direct Amazon product link
    const pubs = (e.publishers ?? []).join(', ');
    const langs = (e.languages ?? []).map((l: any) => l.key).join(',');
    if (langs && !langs.includes('eng')) continue;
    if (BLOCKED_PUBLISHER.test(pubs) || NOT_PRINT.test(e.physical_format ?? '')) continue;
    if (!titleAgrees(e.title ?? '', w.ed.title || w.title) && !titleAgrees(e.title ?? '', w.title)) continue;
    const okPub = !w.ed.publisher || publisherAgrees(w.ed.publisher, pubs);
    const okTr = translatorsAgree(w.ed.translator, e);
    const okYear = !wantYear || yearOf(e.publish_date) === wantYear;
    if (okPub && okTr && okYear) matches.push({ isbn, paper: /paper/i.test(e.physical_format ?? '') });
    else if (okPub && !nearest) {
      nearest = `${isbn} (${pubs}, ${yearOf(e.publish_date) ?? '?'}): ` +
        (!okTr ? 'translator not named in the record' : `year ${yearOf(e.publish_date) ?? '?'}, guide says ${wantYear}`);
      cand = candidateOf(isbn, e);
    }
  }
  if (!matches.length) return { slug: w.slug, status: 'none' as const, note: nearest ? `nearest ${nearest}` : 'no edition matches the named one', cand };

  // Confirm on the record for the ISBN itself, since that is what the buy link resolves to.
  const pick = matches.find((m) => m.paper) ?? matches[0];
  const rec = await cachedJson(`https://openlibrary.org/isbn/${pick.isbn}.json`);
  if (!rec) return { slug: w.slug, status: 'none' as const, note: `${pick.isbn} has no ISBN record to confirm` };
  const pubs = (rec.publishers ?? []).join(', ');
  const recTitle = [rec.title, rec.subtitle].filter(Boolean).join(': ');
  const failed = [
    !(titleAgrees(recTitle, w.ed.title || w.title) || titleAgrees(recTitle, w.title)) && 'title',
    w.ed.publisher && !publisherAgrees(w.ed.publisher, pubs) && 'publisher',
    !translatorsAgree(w.ed.translator, rec) && 'translator',
    wantYear && yearOf(rec.publish_date) !== wantYear && 'year',
    (BLOCKED_PUBLISHER.test(pubs) || NOT_PRINT.test(rec.physical_format ?? '') || !printEvidence(rec)) && 'format',
    combinedVolume(recTitle, w.ed.title || w.title) && 'combined volume',
    collectionMismatch(recTitle, w.ed.title || w.title) && 'single work where the guide names a collection',
    !prefixAgrees(pick.isbn, w.ed.publisher) && 'ISBN registered to another publisher',
    !(await authorAgrees(rec, w.authorName)) && 'author',
  ].filter(Boolean);
  if (failed.length) return { slug: w.slug, status: 'none' as const, note: `${pick.isbn} failed on its own record: ${failed.join(', ')}`, cand: candidateOf(pick.isbn, rec) };
  return { slug: w.slug, status: 'found' as const, isbn: pick.isbn, note: `${recTitle} (${pubs}, ${yearOf(rec.publish_date)})` };
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

/** One row per near miss. The ISBN line and the tick boxes are what --apply-checklist reads. */
function checklistRow(r: { slug: string; note: string; cand?: Candidate }, w: Work): string {
  const c = r.cand!;
  const e = w.ed;
  const named = [e.title ?? w.title, e.translator && `tr. ${e.translator}`, e.publisher, e.year].filter(Boolean).join(', ');
  return [
    `### ${r.slug}`,
    `- Guide names: ${named}`,
    `- ISBN: ${c.isbn}`,
    `- Open Library record: ${c.title} | ${c.publishers || 'no publisher'} | ${c.year} | ${c.format || 'format blank'}${c.by ? ' | ' + c.by.slice(0, 90) : ''}`,
    `- Why it was not accepted: ${r.note.replace(/^nearest \S+ \(.*?\): /, '').replace(/^\S+ failed on its own record: /, 'failed on its own record: ')}`,
    `- Check: [Amazon](https://www.amazon.com/dp/${isbn10Of(c.isbn)}) · [Bookshop](https://bookshop.org/book/${c.isbn})`,
    `- [ ] accept  [ ] reject`,
    '',
  ].join('\n');
}

function writeChecklist(near: any[], works: Work[]) {
  const bySlug = new Map(works.map((w) => [w.slug, w]));
  const rows = near.filter((r) => r.cand && bySlug.has(r.slug));
  const head = [
    '# Edition checklist',
    '',
    'Open each product page and compare title, translator, publisher and year with the line',
    '"Guide names". Tick `[x] accept` only when the page is that exact print edition. Then run',
    '`npx tsx scripts/verify-editions.ts --apply-checklist`. Unticked rows change nothing.',
    '',
  ].join('\n');
  mkdirSync('reports', { recursive: true });
  writeFileSync(CHECKLIST_FILE, head + '\n' + rows.map((r) => checklistRow(r, bySlug.get(r.slug)!)).join('\n'));
  console.log(`\nCHECKLIST: ${rows.length} rows written to ${CHECKLIST_FILE}`);
}

/** Write only the rows ticked accept, through applyIsbn, the same path --apply uses. */
function applyChecklist() {
  if (!existsSync(CHECKLIST_FILE)) { console.log(`No ${CHECKLIST_FILE}; run with --checklist first.`); return; }
  let wrote = 0, skipped = 0;
  for (const section of readFileSync(CHECKLIST_FILE, 'utf8').split(/^### /m).slice(1)) {
    const slug = section.split('\n')[0].trim();
    const isbn = section.match(/^- ISBN: (978\d{10})$/m)?.[1];
    const accepted = /\[[xX]\] accept/.test(section) && !/\[[xX]\] reject/.test(section);
    if (!accepted) continue;
    if (!isbn || !existsSync(`src/content/works/${slug}.md`)) { skipped++; console.log(`  skipped ${slug}: row unreadable`); continue; }
    if (applyIsbn(slug, isbn)) { wrote++; console.log(`  + ${slug}  ${isbn}`); }
    else { skipped++; console.log(`  skipped ${slug}: already has an ISBN or no edition block`); }
  }
  console.log(`\nAPPLIED FROM CHECKLIST: ${wrote} ISBNs written · ${skipped} skipped`);
}

async function main() {
  if (APPLY_CHECKLIST) return applyChecklist();
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
  for (const r of found) console.log(`  + ${r.slug}  ${r.isbn}  ${r.note}`);
  const near = none.filter((r) => /^nearest|failed on its own record/.test(r.note));
  if (near.length) console.log(`\nNEAR MISSES, for a human to settle (${near.length}):`);
  for (const r of near) console.log(`  ? ${r.slug}  ${r.note}`);
  if (CHECKLIST) writeChecklist(near, works);

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
