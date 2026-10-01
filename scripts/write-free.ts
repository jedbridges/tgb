/**
 * Turn the report from scripts/find-free.ts into src/content/free-sources.yaml.
 *
 *   npx tsx scripts/write-free.ts           write the confident rows, list the rest
 *   npx tsx scripts/write-free.ts --check   verify every URL in the yaml still resolves
 *
 * Standard Ebooks wins over Gutenberg wherever both have a work: the text is the same but
 * the edition is proofread, typeset and readable on a phone. Gutenberg carries far more.
 *
 * A match is written only when it is safe to write unread. Anything where the catalogue
 * title does not plainly contain ours, or where either side looks like a volume of a set
 * or a selection from a larger body, is printed for a person to judge instead: a link
 * promising Tennyson's poems that opens one poem is worse than no link.
 *
 * Rows already in the yaml are kept as they are, so hand corrections survive a re-run.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Cand } from './find-free.ts';

export {};

const check = process.argv.includes('--check');
const YAML = 'src/content/free-sources.yaml';
const HEADER = `# Where a work can be read free when the text is not hosted here. Link only: nothing in
# this file is downloaded. Written by scripts/write-free.ts from the report that
# scripts/find-free.ts produces, then corrected by hand.
#
#   work:       the work slug in src/content/works
#   source:     standardebooks | gutenberg | wikisource | archive
#   url:        the page a reader lands on
#   edition:    what they are being given, named honestly (translator, year)
#   translator: as the work's recommendedEdition uses it, when the text is a translation
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- --check: are the links still good? ---------- */

if (check) {
  const rows = [...readFileSync(YAML, 'utf8').matchAll(/work:\s*([a-z0-9-]+).*?url:\s*"?([^",}]+)"?/g)]
    .map((m) => ({ work: m[1], url: m[2].trim() }));
  console.log(`checking ${rows.length} links`);
  let bad = 0, n = 0;
  const lanes = Array.from({ length: 6 }, async () => {
    while (rows.length) {
      const row = rows.pop()!;
      try {
        const res = await fetch(row.url, { method: 'GET', headers: { 'user-agent': 'greatbookslist.com link check' }, signal: AbortSignal.timeout(25_000) });
        if (!res.ok) { console.log(`  ✗ ${res.status} ${row.work} ${row.url}`); bad++; }
        else {
          /*
           * A page that loads is not a book you can read. Standard Ebooks keeps a page for
           * every book it would like to make, marked as a placeholder with a "sponsor this
           * ebook" button and no download, and its search returns those beside the real
           * ones; 56 of them got onto /free/ before this check existed. So the test is the
           * thing a reader came for: a file to download or a way to read it in the browser.
           */
          const html = await res.text();
          const readable = row.url.includes('standardebooks.org')
            ? !/ebook-placeholder/.test(html) && /\.epub|\/text\/single-page/.test(html)
            : /\.(epub3?\.images|epub\.noimages|kf8\.images|html\.images|txt\.utf-8)|Read now|Read online/i.test(html);
          if (!readable) { console.log(`  ✗ nothing to read ${row.work} ${row.url}`); bad++; }
        }
      } catch (e) { console.log(`  ✗ error ${row.work} ${row.url}`); bad++; }
      if (++n % 50 === 0) console.log(`  ${n}…`);
      await sleep(80);
    }
  });
  await Promise.all(lanes);
  console.log(bad ? `\n${bad} links need attention` : '\nevery link resolves');
  process.exit(bad ? 1 : 0);
}

/* ---------- --editions: name the translator, where Gutenberg knows one ---------- */

/*
 * The catalogue file has no translator column, so a row written from it can only say "the
 * Project Gutenberg text". Gutendex knows, and asked by id it answers in a few seconds,
 * so the rows that matter are filled in one pass. A translated work whose translator we
 * cannot name keeps the honest generic line rather than a guess.
 */
if (process.argv.includes('--editions')) {
  const text = readFileSync(YAML, 'utf8');
  const rows = [...text.matchAll(/^- \{ id: [a-z0-9-]+, work: ([a-z0-9-]+), source: gutenberg, url: "https:\/\/www\.gutenberg\.org\/ebooks\/(\d+)"[^\n]*$/gm)]
    .filter((m) => !m[0].includes('translator:'))
    .map((m) => ({ line: m[0], slug: m[1], id: Number(m[2]) }));
  console.log(`${rows.length} Gutenberg rows without a named translator`);
  const edits = new Map<string, string>();
  let n = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (rows.length) {
      const row = rows.pop()!;
      try {
        const res = await fetch(`https://gutendex.com/books/${row.id}`, { headers: { 'user-agent': 'greatbookslist.com link check' }, signal: AbortSignal.timeout(30_000) });
        if (res.ok) {
          const book = await res.json() as { translators?: { name: string }[] };
          const raw = book.translators?.[0]?.name;
          if (raw) {
            // Gutendex gives "Butler, Samuel"; a sentence wants "Samuel Butler".
            const name = raw.includes(',') ? raw.split(',').map((p) => p.trim()).reverse().join(' ') : raw;
            edits.set(row.line, row.line
              .replace(/edition: "[^"]*"/, `edition: ${JSON.stringify(`${name}'s translation`)}`)
              .replace(/ \}$/, `, translator: ${JSON.stringify(name)} }`));
          }
        }
      } catch { /* leave the generic line */ }
      if (++n % 25 === 0) console.log(`  ${n}…`);
      await sleep(100);
    }
  }));
  let out = text;
  for (const [from, to] of edits) out = out.replace(from, to);
  writeFileSync(YAML, out);
  console.log(`named a translator on ${edits.size} rows`);
  process.exit(0);
}

/* ---------- writing ---------- */

const cands = JSON.parse(readFileSync('.cache/free-candidates.json', 'utf8')) as Cand[];

const existing = new Map<string, string>();
if (existsSync(YAML)) {
  for (const m of readFileSync(YAML, 'utf8').matchAll(/^- \{ id: ([a-z0-9-]+).*$/gm)) existing.set(m[1], m[0]);
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* A title that stands for a body of work rather than one text. Matching those to a single
   catalogue entry is how you end up promising the poems and delivering one poem. */
const COLLECTION = /\b(poems|poetry|works|selections?|selected|stories|tales|essays|plays|dialogues|letters|writings|fragments|odes|sonnets|lectures|speeches|treatises|meditations)\b/;
const PARTIAL = /\b(volume|vol\.?|part|selections?|selected|abridg|extracts?|an?thology|reader)\b/i;

interface Row { slug: string; source: 'standardebooks' | 'gutenberg'; url: string; edition: string; translator?: string; why?: string }

const confident: Row[] = [];
const review: { slug: string; source: string; url: string; theirTitle: string; ourTitle: string; why: string }[] = [];

for (const c of cands) {
  if (existing.has(c.slug)) continue;
  const useSE = Boolean(c.se);
  const hit = c.se ?? c.pg;
  if (!hit) continue;
  const theirTitle = c.se ? c.se.titleSlug : c.pg!.title;
  const ourWords = norm(c.title).split(' ').filter(Boolean);
  const theirs = new Set(norm(theirTitle).split(' '));
  // Our own title, not just an alias, has to be in theirs for this to go in unread.
  const containsOurTitle = ourWords.every((w) => theirs.has(w));
  const suspect =
    !containsOurTitle ? 'their title does not contain ours' :
    COLLECTION.test(norm(c.title)) ? 'ours names a body of work' :
    PARTIAL.test(theirTitle) ? 'theirs looks like one volume or a selection' : '';

  const translator = c.se?.translator ?? c.pg?.translator;
  const edition = translator
    ? `${translator}'s translation`
    : useSE ? 'The Standard Ebooks edition' : 'The Project Gutenberg text';

  if (suspect) {
    review.push({ slug: c.slug, source: useSE ? 'standardebooks' : 'gutenberg', url: hit.url, theirTitle, ourTitle: c.title, why: suspect });
  } else {
    confident.push({ slug: c.slug, source: useSE ? 'standardebooks' : 'gutenberg', url: hit.url, edition, translator });
  }
}

const line = (r: Row) =>
  `- { id: ${r.slug}, work: ${r.slug}, source: ${r.source}, url: "${r.url}", edition: "${r.edition}"${r.translator ? `, translator: ${JSON.stringify(r.translator)}` : ''} }`;

const body = [...existing.values(), ...confident.map(line)].sort((a, b) => a.localeCompare(b));
writeFileSync(YAML, `${HEADER}${body.join('\n')}\n`);

console.log(`${body.length} rows in ${YAML} (${existing.size} kept, ${confident.length} added)`);
console.log(`${review.length} need a person to look at them:\n`);
for (const r of review) console.log(`  ${r.slug.padEnd(44)} ${r.why}\n      ours: ${r.ourTitle}\n      them: ${r.theirTitle}  ${r.url}`);
writeFileSync('.cache/free-review.json', JSON.stringify(review, null, 2));
console.log(`\nAlso written to .cache/free-review.json. Add the good ones to ${YAML} by hand, then: npx tsx scripts/write-free.ts --check`);
