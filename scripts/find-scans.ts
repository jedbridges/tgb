/**
 * Real covers for the works that have none, from scans of public-domain editions.
 *
 *   npx tsx scripts/find-scans.ts [--sample N] [--dry] [--force] [slug ...]
 *
 * 375 works sit on a generated typographic cover because no modern edition's ISBN resolved
 * to a jacket. Many of them are old enough that somebody has scanned a real edition and put
 * it in the Internet Archive, and the first page of that scan is the truest cover this site
 * could show: it is the actual book.
 *
 * The whole difficulty is that a title search is not a match. Surveying ten of these works,
 * the Archive returned something for nine and about half of those were the wrong thing:
 * "Job" found a book *about* Job, and two different poets both found the same volume of
 * criticism. Putting a study of a work on the page for the work is worse than showing no
 * cover at all, so this refuses by default and accepts only on evidence:
 *
 *   - the author has to be there. A candidate whose creator field does not carry the
 *     author's surname is rejected outright, whatever its title says. This one rule kills
 *     every mismatch the survey turned up.
 *   - the title has to be the work's title, not a title containing it. Anything reading as
 *     commentary (a guide, a companion, essays, criticism, a casebook) is rejected unless
 *     it matches the work's title exactly.
 *   - a scan cannot predate the work it claims to be.
 *   - and the edition has to be demonstrably public domain: the Archive's own copyright
 *     status, an open licence, or a publication date early enough to settle it. Silence
 *     does not qualify, which is what keeps a 1968 Solzhenitsyn out.
 *   - lending-only items are excluded, both because their page images are not served and
 *     because they are not ours to show.
 *
 * Then the image itself has to survive: a real width, the proportions of a book rather
 * than a plate or a map, and enough variation across the pixels that it is not a blank
 * leaf, which is what the Archive serves when a scan has no cover.
 *
 * Accepting half of the 375 is a good outcome here. The rest keep a cover that is plain
 * but never wrong.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import sharp from 'sharp';

const OUT = 'src/assets/covers';
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const sampleAt = args.indexOf('--sample');
const sample = sampleAt >= 0 ? Number(args[sampleAt + 1]) : 0;
const only = new Set(args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sample'));

/* US public domain: published works from this year and earlier. Update it in January. */
const PD_BEFORE = 1930;

const UA = { 'User-Agent': 'the-great-books/1.0 (+https://greatbookslist.com; cover cache build)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fm(file: string) {
  const m = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  return m ? parse(m[1]) : null;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'on', 'in', 'to', 'de', 'la', 'le', 'vol', 'volume', 'book', 'books']);
const tokens = (s: string) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** Titles that announce themselves as being about a work rather than being it. */
const ABOUT = /\b(introduction|introducing|guide|companion|critical|criticism|essays?|study|studies|readings?|reader|interpreting|interpretation|notes|analysis|handbook|casebook|approaches|perspectives|commentar(y|ies)|summary|abstract|selections?|adapted|retold|children|jr|junior|lesson|workbook|teaching|questions)\b/i;

interface Candidate {
  identifier: string; title?: string | string[]; creator?: string | string[];
  year?: string | number; language?: string | string[]; downloads?: number;
  licenseurl?: string | string[]; 'possible-copyright-status'?: string | string[];
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function search(title: string, surname: string): Promise<Candidate[]> {
  const q = `mediatype:texts AND NOT collection:(inlibrary) AND title:("${title.replace(/"/g, '')}") AND creator:("${surname.replace(/"/g, '')}")`;
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    '&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=language&fl[]=downloads' +
    '&fl[]=licenseurl&fl[]=possible-copyright-status' +
    '&sort[]=downloads+desc&rows=8&page=1&output=json';
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.response?.docs ?? [];
  } catch { return []; }
}

interface Verdict { ok: boolean; why: string }

function judge(c: Candidate, work: { title: string; surname: string; year: number }): Verdict {
  const cTitle = first(c.title);
  const cCreator = first(c.creator);
  if (!cTitle) return { ok: false, why: 'no title' };

  // The author, first. This is the rule that does the work.
  const sn = norm(work.surname);
  if (!sn) return { ok: false, why: 'work has no usable surname' };
  if (!norm(cCreator).includes(sn)) return { ok: false, why: `creator "${cCreator}" is not ${work.surname}` };

  const want = tokens(work.title);
  const got = new Set(tokens(cTitle));
  if (!want.length) return { ok: false, why: 'work title is all stopwords' };
  const overlap = want.filter((w) => got.has(w)).length / want.length;
  if (overlap < 1) return { ok: false, why: `title "${cTitle}" is missing part of the work's title` };

  // Present, but wrapped in something that is about it rather than it.
  const extra = tokens(cTitle).filter((w) => !want.includes(w));
  if (extra.length && ABOUT.test(cTitle)) return { ok: false, why: `title "${cTitle}" reads as commentary` };

  const cYear = Number(String(c.year ?? '').slice(0, 4));
  if (cYear && work.year && cYear < work.year) return { ok: false, why: `dated ${cYear}, before the work` };

  /*
   * Public domain, and demonstrably so.
   *
   * The Archive holds plenty of in-copyright uploads alongside the scans of old editions,
   * and a title search cannot tell them apart: the survey turned up a 1968 Solzhenitsyn
   * and a 2016 Diderot, both perfectly good matches and neither ours to use. An edition
   * qualifies on either of two pieces of evidence: the Archive says it is not in
   * copyright, or it carries an open licence, or it was published early enough that it
   * could not be anything else. Nothing qualifies on silence.
   */
  const status = String(first(c['possible-copyright-status'] as string | string[] | undefined)).toUpperCase();
  const licence = String(first(c.licenseurl)).toLowerCase();
  const declaredFree = status.includes('NOT_IN_COPYRIGHT') || /creativecommons\.org|publicdomain|\/mark\//.test(licence);
  const oldEnough = cYear > 0 && cYear <= PD_BEFORE;
  if (!declaredFree && !oldEnough) {
    return { ok: false, why: cYear ? `${cYear} edition, not shown to be public domain` : 'no date and no licence, so not shown to be public domain' };
  }

  return { ok: true, why: `${cTitle} · ${cCreator}${cYear ? ` · ${cYear}` : ''}${declaredFree && !oldEnough ? ' · declared free' : ''}` };
}

/** The scan has to look like the cover of a book and not like a blank leaf or a plate. */
async function usable(buf: Buffer): Promise<string | null> {
  try {
    const img = sharp(buf);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 380) return `only ${w}px wide`;
    const ratio = h / w;
    if (ratio < 1.15 || ratio > 1.95) return `proportions ${ratio.toFixed(2)} are not a book`;
    const stats = await img.stats();
    const spread = Math.max(...stats.channels.map((c) => c.stdev));
    if (spread < 14) return `flat image, stdev ${spread.toFixed(1)}`;
    return null;
  } catch (e) { return `unreadable (${(e as Error).message})`; }
}

/**
 * Rewrite the cover block, or refuse to touch the file.
 *
 * A regex once corrupted six of these files in this project, so this matches only the two
 * shapes the content actually uses and throws on anything else rather than guessing.
 */
function adopt(file: string, identifier: string, credit: string) {
  const src = readFileSync(file, 'utf8');
  const block = `cover:\n  source: archive\n  archiveId: ${identifier}\n  credit: ${JSON.stringify(credit)}\n`;
  const flow = /^cover:[ \t]*\{[^}]*\}[ \t]*\n/m;
  const indented = /^cover:[ \t]*\n(?:[ \t]+\S.*\n)+/m;
  let out: string;
  if (flow.test(src)) out = src.replace(flow, block);
  else if (indented.test(src)) out = src.replace(indented, block);
  else throw new Error(`${file}: cover block is in a shape this script does not recognise`);
  writeFileSync(file, out);
}

async function main() {
  const files = readdirSync('src/content/works').filter((f) => f.endsWith('.md'));
  const authors = new Map<string, { name: string; surname: string }>();
  for (const f of readdirSync('src/content/authors').filter((f) => f.endsWith('.md'))) {
    const d = fm(`src/content/authors/${f}`);
    if (!d) continue;
    const sortName: string = d.sortName ?? d.name ?? '';
    authors.set(f.replace('.md', ''), { name: d.name, surname: sortName.split(',')[0].trim() });
  }

  let todo = files
    .map((f) => ({ file: `src/content/works/${f}`, slug: f.replace('.md', ''), d: fm(`src/content/works/${f}`) }))
    .filter((w) => w.d && w.d.cover?.source === 'generated')
    .filter((w) => (only.size ? only.has(w.slug) : true))
    .filter((w) => force || !existsSync(`${OUT}/${w.slug}.jpg`));
  if (sample) todo = todo.filter((_, i) => i % Math.ceil(todo.length / sample) === 0).slice(0, sample);

  console.log(`${todo.length} works without a cover to try\n`);
  let took = 0, refused = 0, nothing = 0, badImage = 0;

  for (const w of todo) {
    const a = authors.get(w.d.author);
    if (!a?.surname) { console.log(`  --    ${w.slug.padEnd(46)} no author on file`); refused++; continue; }

    const docs = await search(w.d.title, a.surname);
    await sleep(900);
    if (!docs.length) { console.log(`  --    ${w.slug.padEnd(46)} nothing in the archive`); nothing++; continue; }

    let hit: { c: Candidate; why: string } | null = null;
    const notes: string[] = [];
    for (const c of docs) {
      const v = judge(c, { title: w.d.title, surname: a.surname, year: Number(w.d.year) || 0 });
      if (v.ok) { hit = { c, why: v.why }; break; }
      notes.push(`${c.identifier}: ${v.why}`);
    }
    if (!hit) {
      console.log(`  no    ${w.slug.padEnd(46)} ${notes[0] ?? ''}`);
      refused++; continue;
    }

    const url = `https://archive.org/download/${hit.c.identifier}/page/cover_w600.jpg`;
    let buf: Buffer | null = null;
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow' });
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } catch { /* falls through */ }
    await sleep(600);
    if (!buf) { console.log(`  img   ${w.slug.padEnd(46)} no cover image served`); badImage++; continue; }

    const bad = await usable(buf);
    if (bad) { console.log(`  img   ${w.slug.padEnd(46)} ${bad}`); badImage++; continue; }

    const credit = `Internet Archive, ${hit.c.identifier}`;
    if (!dry) {
      await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}/${w.slug}.jpg`);
      adopt(w.file, hit.c.identifier, credit);
    }
    console.log(`  ok    ${w.slug.padEnd(46)} ${hit.why}`);
    took++;
  }

  console.log(`\nscans: ${took} adopted, ${refused} refused on the evidence, ${nothing} not in the archive, ${badImage} image unusable`);
  if (dry) console.log('(dry run: nothing written)');
  else if (took) console.log('next: npx tsx scripts/fetch-covers.ts && npx tsx scripts/extract-palettes.ts');
}

main();
