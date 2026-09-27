/**
 * Fetch public domain texts and write them as sections into src/content/texts.
 *
 *   npx tsx scripts/fetch-texts.ts                 every work in src/content/text-sources.yaml
 *   npx tsx scripts/fetch-texts.ts homer-odyssey   one work
 *   npx tsx scripts/fetch-texts.ts --dry           parse and report, write nothing
 *
 * Standard Ebooks publishes each book as one HTML page at <book>/text/single-page, with a
 * <section> per chapter and its heading inside; Project Gutenberg publishes an HTML file per
 * book number with headings but no sections. Both are cached under .cache/texts so a change to
 * the splitting never refetches. Sections shorter than 200 words are folded into the one
 * before, so a title page or a dedication is never a page of its own.
 *
 * The output is one Markdown file per section with the front matter the texts collection
 * expects (src/content.config.ts). Nothing here is edited by hand: fix the source map and
 * run again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { parse as parseHtml, HTMLElement, Node } from 'node-html-parser';
import { decodeHTML } from 'entities';
const decode = (s: string) => decodeHTML(s);

/* `match` is a regular expression on the section's heading path ("Apology" or "Antigone: Scene 1")
   for a volume that holds several works, so each work takes only its own sections. */
interface Source { work: string; source: 'standardebooks' | 'gutenberg'; url: string; edition: string; translator?: string; match?: string; skip?: string }
interface Section { heading: string; body: string; path: string }

const DRY = process.argv.includes('--dry');
const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
const MIN_WORDS = 200;
const CACHE = '.cache/texts';
const OUT = 'src/content/texts';
mkdirSync(CACHE, { recursive: true });

const sources = parseYaml(readFileSync('src/content/text-sources.yaml', 'utf8')) as Source[];

function pageUrl(s: Source): string {
  if (s.source === 'standardebooks') return s.url.replace(/\/$/, '') + '/text/single-page';
  return `https://www.gutenberg.org/cache/epub/${s.url}/pg${s.url}-images.html`;
}
function licence(s: Source): string {
  return s.source === 'standardebooks'
    ? 'Public domain in the United States; the Standard Ebooks edition is released under CC0.'
    : 'Public domain in the United States; the Project Gutenberg edition is free of restrictions under the Project Gutenberg License.';
}

async function fetchCached(url: string, key: string): Promise<string> {
  const file = `${CACHE}/${key}.html`;
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': 'greatbookslist.com text fetch (contact via site)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const html = await res.text();
  writeFileSync(file, html);
  return html;
}

/* HTML to the plain Markdown the section files hold: paragraphs, verse lines kept as lines,
   emphasis as *, block quotes as >, nothing else. Footnote markers and page anchors go. */
function textOf(node: Node): string {
  if (node.nodeType === 3) return decode(node.rawText).replace(/_{4,}/g, '').replace(/\s+/g, ' '); // a rule drawn in underscores is not text
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (!tag) return el.childNodes.map(textOf).join('');
  if (['script', 'style', 'sup', 'aside', 'nav', 'img', 'figure'].includes(tag)) return '';
  if (tag === 'pre') return preLines(el);
  if (el.getAttribute('epub:type')?.includes('noteref') || el.classList?.contains('pagenum')) return '';
  const inner = el.childNodes.map(textOf).join('');
  if (tag === 'em' || tag === 'i') return inner.trim() ? `*${inner.trim()}*` : '';
  if (tag === 'br') return '\n';
  if (tag === 'p') {
    // Verse: Standard Ebooks marks lines with <span> inside <p>; Gutenberg often uses <br>.
    /* Verse is marked as such by the source (Standard Ebooks: z3998:verse, poem, song on an
       ancestor; Gutenberg: a poem class), never guessed from spans, which SE also uses for
       roman numerals and foreign phrases inside ordinary prose. */
    const verseHost = (n: HTMLElement | null): boolean => !!n && (/(^|\s)(z3998:)?(verse|poem|song|stanza)(\s|$)/.test(`${n.getAttribute?.('epub:type') ?? ''} ${n.getAttribute?.('class') ?? ''}`) || verseHost(n.parentNode as HTMLElement | null));
    const hasBreaks = !!el.querySelector(':scope > br');
    const isVerse = verseHost(el) || (hasBreaks && el.querySelectorAll(':scope > span').length > 1);
    const lines = isVerse ? el.querySelectorAll(':scope > span') : [];
    const text = isVerse ? lines.length > 1 ? lines.map((l) => textOf(l).trim()).join('  \n') : inner.split('\n').map((l) => l.trim()).filter(Boolean).join('  \n') : inner.replace(/\s+/g, ' ').trim();
    return text ? `\n\n${text}\n\n` : '';
  }
  if (tag === 'blockquote') return `\n\n${inner.trim().split(/\n{2,}/).map((p) => '> ' + p.replace(/\n/g, '\n> ')).join('\n>\n')}\n\n`;
  if (/^h[1-6]$/.test(tag)) return '';
  if (tag === 'div' && /(^|\s)(poem|stanza|verse|poetry)(\s|$)/.test(el.getAttribute('class') ?? '') && !el.querySelector('p')) {
    const lines = el.querySelectorAll('span, div.line, .line').map((l) => textOf(l).trim()).filter(Boolean);
    return `\n\n${(lines.length ? lines : inner.split('\n').map((l) => l.trim()).filter(Boolean)).join('  \n')}\n\n`;
  }
  if (['div', 'section', 'article', 'body', 'html', 'header', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'hr'].includes(tag)) return `\n\n${inner}\n\n`;
  return inner;
}
/* A pre block as verse: the common indent goes, so Markdown does not take the lines for
   code, and each line ends with the two spaces that keep it a line. */
function preLines(el: HTMLElement): string {
  const lines = decode(el.rawText).split('\n').map((l) => l.replace(/\s+$/, ''));
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  return '\n\n' + lines.map((l) => l.slice(indent)).join('  \n').replace(/(  \n){2,}/g, '\n\n') + '\n\n';
}
/* Trailing whitespace goes, except the two spaces that mark a verse line break in Markdown:
   those stay, or every poem and every speech would run together as prose on the page. */
const tidy = (s: string) => s.replace(/[ \t]+\n/g, (m) => (m.length >= 3 ? '  \n' : '\n')).replace(/(  )?\n(\s*\n)+/g, '\n\n').trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/* ALL CAPS headings read as shouting on the page; keep small words small. Roman numerals stay. */
function titleCase(s: string): string {
  if (s.length < 4 || s !== s.toUpperCase() || !/[A-Z]{3}/.test(s)) return s;
  const small = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'but', 'nor']);
  return s.toLowerCase().split(' ').map((w, i) => /^[ivxlc]+[.,:;]?$/.test(w) ? w.toUpperCase() : i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function headingText(el: HTMLElement): string {
  // Standard Ebooks headings carry an ordinal and a title in separate spans: "Book I" / "The Anger of Achilles".
  const parts = el.querySelectorAll('span').map((s) => s.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const label = /^(act|scene|book|chapter|canto|part|section|letter|essay)$/i;
  const raw = parts.length >= 2 ? (label.test(parts[0]) ? `${parts[0]} ${parts[1]}` : parts.slice(0, 2).join(': ')) : el.text.replace(/\s+/g, ' ').trim();
  return titleCase(raw.replace(/\s*:\s*$/, ''));
}

function splitStandardEbooks(html: string): Section[] {
  const root = parseHtml(html, { blockTextElements: { script: false, style: false } });
  const body = root.querySelector('body') ?? root;
  const sections: Section[] = [];
  const leaves = body.querySelectorAll('section, article').filter((s) => !s.querySelector('section, article'));
  for (const s of leaves) {
    const type = s.getAttribute('epub:type') ?? '';
    if (/titlepage|imprint|colophon|copyright|toc|loi|dedication|halftitlepage|frontmatter|backmatter|endnotes|bibliography|glossary/.test(type)) continue;
    // The heading element itself, never the whole header: a header may also hold an epigraph.
    const h = s.querySelector('h1, h2, h3, h4, h5, h6') ?? s.querySelector('header');
    const heading = h ? headingText(h) : '';
    let bodyText = tidy(textOf(s));
    if (!bodyText) continue;
    let heading2 = heading;
    if (/^[ivxlc\d]+$/i.test(heading)) {
      const first = bodyText.split('\n')[0].trim();
      // A short first line with no full stop is a title set as a paragraph; a quoted or
      // italic first line is an epigraph, and a chapter with only a number is "Chapter I".
      if (first.length > 0 && first.length <= 80 && !/[.!?,;]$/.test(first) && !/^[>*]/.test(first)) { heading2 = `${heading}: ${first}`; bodyText = tidy(bodyText.slice(first.length)); }
      else heading2 = `Chapter ${heading}`;
    }
    // The headings of the enclosing sections, so a dialogue's chapters carry the dialogue's name.
    const ancestors: string[] = [];
    for (let a = s.parentNode as HTMLElement | null; a; a = a.parentNode as HTMLElement | null) {
      if (a.tagName?.toLowerCase() === 'section') { const ah = a.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > header'); if (ah) ancestors.unshift(headingText(ah)); }
    }
    // A scene needs its act, a chapter its book: "Act I, Scene II" rather than "Scene II".
    if (ancestors.length && /^(scene|chapter|canto|section|[ivxlc]+|\d+)\b/i.test(heading2) && !/^(book|part|act)\b/i.test(heading2)) heading2 = `${ancestors[ancestors.length - 1]}, ${heading2}`;
    sections.push({ heading: heading2, body: bodyText, path: [...ancestors, heading2].filter(Boolean).join(' / ') });
  }
  return sections;
}

function splitGutenberg(html: string, workTitle = ''): Section[] {
  const root = parseHtml(html, { blockTextElements: { script: false, style: false } });
  const body = root.querySelector('body') ?? root;
  // Drop the licence and boilerplate that Gutenberg wraps around the text.
  for (const sel of ['#pg-header', '#pg-footer', '.pg-boilerplate']) body.querySelectorAll(sel).forEach((n) => n.remove());
  const sections: Section[] = [];
  let cur: { heading: string; path: string; parts: string[] } | null = null;
  let part = ''; // the nearest h1/h2: "Book One", "Part I", "Inferno"
  let title = ''; // the file's first heading, the work's title; the guide's title when the file has none
  const name = () => title || workTitle;
  const flush = () => { if (cur) { const b = tidy(cur.parts.join('')); if (b) sections.push({ heading: cur.heading, body: b, path: cur.path }); } };
  const bare = (t: string) => /^(chapter|canto|book|part|scene|act)?\s*[ivxlc\d]+\.?$/i.test(t) || t.length <= 3;
  const walk = (n: Node) => {
    const el = n as HTMLElement;
    const tag = el.tagName?.toLowerCase();
    if (tag && /^h[1-4]$/.test(tag)) {
      // "BOOK I." is Book I, and a heading's em dash is a colon on this site.
      const t = el.text.replace(/\s+/g, ' ').trim().replace(/\.$/, '').replace(/\s*[—–]\s*/g, ': ');
      if (!title && tag === 'h1') title = t;
      // An epigraph set as a heading is not a heading; keep the current section open. A long
      // heading that opens with its number ("First Section: Transition from...") is a heading.
      if (t.length > 90 && !/^((first|second|third|fourth|fifth|sixth)\s+(section|part|book)|(book|part|chapter|canto|section|act)\s+[ivxlc\d]+)\b/i.test(t)) { if (cur) cur.parts.push(`\n\n*${t}*\n\n`); return; }
      // A cast list heads the play, not a section of its own: opened as a section it would
      // swallow every speech that follows and then be dropped as front matter by its name.
      if (/^(argument|the argument)$/i.test(t) && cur) { cur.parts.push(`\n\n**${titleCase(t)}**\n\n`); return; }
      // A cast list is where the text proper begins: in the Jowett dialogues it follows the
      // translator's introduction with no heading of the dialogue's own, so the section it
      // opens takes the work's title, and the introduction's part ends here.
      if (/^(dramatis person(ae|æ)|persons?( of the (drama|play|dialogue)| represented)?|characters( in the play)?|the persons)\b/i.test(t)) {
        flush();
        if (/^(introduction|preface|by\b)/i.test(part) || !part) part = name() || part;
        cur = { heading: titleCase(part || t), path: part || t, parts: [`\n\n**${titleCase(t)}**\n\n`] };
        return;
      }
      // A transcriber's note set as a heading heads nothing; the text under it belongs to
      // the section already open, or to the work itself if none is.
      if (/transliterat|transcriber/i.test(t)) { if (!cur) cur = { heading: titleCase(name() || t), path: name() || t, parts: [] }; return; }
      // "Translated by Benjamin Jowett" heads the text itself in the Jowett volumes. It comes
      // twice in a file: once under the title page, once after the introduction, where the
      // dialogue proper begins under its own h2 ("GORGIAS", h3 "By Plato", h3 "Translated
      // by"). The section it opens takes that part's name, or the work's title when the part
      // is only an author line; an appended piece keeps its own name for the source map to skip.
      if (/^translated (by|into)\b/i.test(t)) {
        flush();
        const n = part && !/^(by\b|contents$)/i.test(part) ? part : name() || t;
        cur = { heading: titleCase(n), path: n, parts: [] };
        return;
      }
      flush();
      // A heading that names a book, part, act or volume is a part whatever its level:
      // Gutenberg sets "BOOK I" as h3 in one file and h2 in the next.
      if (tag === 'h1' || tag === 'h2' || /^(book|part|act|volume)\b/i.test(t)) {
        // A part heading opens a section of its own only until the first chapter arrives.
        part = t;
        cur = { heading: titleCase(t), path: t, parts: [] };
      } else {
        // A bare number, a scene, or a tale's own "The Prologue" needs its part: "Act I, Scene II",
        // "The Miller's Tale, The Prologue".
        const wantsPart = bare(t) || /^(scene\b|(the )?(prologue|tale|epilogue)$)/i.test(t);
        const heading = wantsPart && part && !/^(book|part|canto)\b/i.test(t) ? `${part}, ${t}` : t;
        cur = { heading: titleCase(heading), path: part ? `${part} / ${t}` : t, parts: [] };
      }
      return;
    }
    // A cross reference to another Gutenberg number is catalogue housekeeping, not text.
    if (tag === 'p' && /^\s*Note:\s*See also\b/i.test(el.text)) return;
    if (tag && ['p', 'blockquote', 'ul', 'ol', 'table'].includes(tag)) { if (cur) cur.parts.push(textOf(el)); return; }
    // Older Gutenberg files set verse, and sometimes whole books, in <pre>: keep the lines.
    if (tag === 'pre') { if (cur) cur.parts.push(preLines(el)); return; }
    // Gutenberg sets verse in <div class="poem"> or "stanza" full of spans or line breaks: take it whole.
    if (tag === 'div' && /(^|\s)(poem|stanza|verse|poetry)(\s|$)/.test(el.getAttribute('class') ?? '')) { if (cur) cur.parts.push(textOf(el)); return; }
    // Some files set speeches as text and line breaks straight inside a <div>, with no <p>
    // at all: a div with words of its own is taken whole, or those words would be lost.
    if (tag === 'div' && el.childNodes.some((c) => c.nodeType === 3 && c.rawText.trim())) { if (cur) cur.parts.push(textOf(el)); return; }
    for (const c of el.childNodes ?? []) walk(c);
  };
  walk(body);
  flush();
  // A file whose headings the walker could not read still has its text: one section, the
  // whole of it, is better than nothing at all.
  if (!sections.length) { const b = tidy(textOf(body)); if (b) sections.push({ heading: titleCase(name() || 'Text'), body: b, path: name() || 'Text' }); }
  return sections;
}

/* Fold short sections into the one before, and drop the front matter that survives the
   type filters (a table of contents rendered as a section, a two line epigraph). */
function fold(sections: Section[]): Section[] {
  /* A file with one heading and forty thousand words has its books inside the text: a
     short line in capitals or "Book III" on a line of its own. Split there. */
  sections = sections.flatMap((s) => {
    if (words(s.body) < 40000) return [s];
    const parts: Section[] = []; let head = s.heading; let buf: string[] = [];
    for (const line of s.body.split('\n')) {
      const t = line.replace(/\s+\\?$/, '').trim();
      // A book heading on a line of its own, or, in the Summa, a question's title with its
      // article count: "THE EXISTENCE OF GOD (In Three Articles)".
      const question = t.match(/^(.{4,90}?)\s*\((?:in )?[a-z-]+ articles?\)$/i);
      if ((/^(BOOK|PART|CANTO|CHAPTER|QUESTION|TREATISE)\s+[IVXLC\d]+\b.{0,60}$/i.test(t) && t.split(/\s+/).length <= 12) || question) {
        const b = tidy(buf.join('\n')); if (b) parts.push({ heading: head, body: b, path: `${s.path} / ${head}` });
        head = titleCase((question ? question[1] : t).replace(/\s+/g, ' ')); buf = []; continue;
      }
      buf.push(line);
    }
    const b = tidy(buf.join('\n')); if (b) parts.push({ heading: head, body: b, path: `${s.path} / ${head}` });
    return parts.length > 1 ? parts : [s];
  });
  const out: Section[] = [];
  for (const s of sections) {
    const h = s.heading.trim().replace(/[:.]$/, '');
    if (/^\d{3,4}$/.test(h)) continue; // a year standing as a heading is front matter
    if (/^(contents|table of contents|list of illustrations|index|footnotes|endnotes|notes?( to .*)?|transcriber.?s? notes?|project gutenberg.*|.*bookmarks|dramatis person(ae|æ)|the following is a list.*|by [a-z .]+|all greek .*|.*transliterated.*|bibliography|editor.?s? preface|foreign theological library.*)$/i.test(h)) continue;
    // A section that opens with the contents list is the front matter, whatever its heading.
    if (/^(contents|table of contents)\b/i.test(s.body.trimStart().split('\n')[0].replace(/[*_]/g, ''))) continue;
    if (out.length && words(s.body) < MIN_WORDS) { out[out.length - 1].body += `\n\n**${s.heading}**\n\n${s.body}`; continue; }
    // The title block's short section (a translator's note, the argument) and the play that
    // follows carry the same name: one section, not two called "Antigone".
    const prev = out[out.length - 1];
    if (prev && prev.heading === s.heading && words(prev.body) < 1000) { prev.body = `${prev.body}\n\n${s.body}`; continue; }
    out.push({ ...s });
  }
  if (out.length && words(out[0].body) < MIN_WORDS && out.length > 1) { out[1].body = `**${out[0].heading}**\n\n${out[0].body}\n\n${out[1].body}`; out.shift(); }
  return out;
}

const slugify = (s: string) => {
  const id = s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return !id ? 'section' : /^\d/.test(id) ? `part-${id}` : id; // a bare number is not a slug, and YAML would read it as one
};

async function run(s: Source) {
  const url = pageUrl(s);
  const html = await fetchCached(url, `${s.work}-${s.source}-${s.url.replace(/[^a-z0-9]+/gi, '-').slice(-40)}`);
  const workTitle = readFileSync(`src/content/works/${s.work}.md`, 'utf8').match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? '';
  let raw = s.source === 'standardebooks' ? splitStandardEbooks(html) : splitGutenberg(html, workTitle);
  if (s.match) {
    const re = new RegExp(s.match, 'i');
    const kept = raw.filter((x) => re.test(x.path));
    if (!kept.length) throw new Error(`match /${s.match}/ selected nothing; headings are: ${[...new Set(raw.map((x) => x.path.split(' / ')[0]))].slice(0, 12).join(' | ')}`);
    raw = kept;
  }
  // A translator's introduction or analysis is not the work; the source map names it to leave out.
  if (s.skip) {
    const re = new RegExp(s.skip, 'i'); const kept = raw.filter((x) => !re.test(x.path));
    // A skip that would take everything is a skip that misread the file; keep the text.
    if (kept.length) raw = kept; else console.warn(`${s.work}: skip /${s.skip}/ would leave nothing; ignored`);
  }
  let sections = fold(raw);
  // Every section named like front matter is a file the walker misread: the longest section
  // is the text, whatever its heading, and one section beats a failed source.
  if (!sections.length && raw.length) {
    const longest = raw.reduce((a, b) => (words(b.body) > words(a.body) ? b : a));
    console.warn(`${s.work}: every section looked like front matter; keeping the longest, "${longest.heading}"`);
    sections = [longest];
  }
  const total = sections.reduce((n, x) => n + words(x.body), 0);
  console.log(`${s.work}: ${sections.length} sections, ${total.toLocaleString()} words${DRY ? ' (dry)' : ''}`);
  if (!sections.length) throw new Error(`nothing parsed from ${url}`);
  if (DRY) return;
  const dir = `${OUT}/${s.work}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const seen = new Set<string>();
  sections.forEach((sec, i) => {
    let id = slugify(sec.heading) || `part-${i + 1}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    const q = (v: string) => JSON.stringify(v);
    const fm = [
      `work: ${s.work}`, `section: ${q(id)}`, `heading: ${q(sec.heading || `Part ${i + 1}`)}`, `order: ${i + 1}`,
      `source: ${s.source}`, `sourceUrl: ${q(s.source === 'standardebooks' ? s.url : `https://www.gutenberg.org/ebooks/${s.url}`)}`,
      `edition: ${q(s.edition)}`, ...(s.translator ? [`translator: ${q(s.translator)}`] : []), `licence: ${q(licence(s))}`, `words: ${words(sec.body)}`,
    ];
    writeFileSync(`${dir}/${String(i + 1).padStart(3, '0')}-${id}.md`, `---\n${fm.join('\n')}\n---\n${sec.body}\n`);
  });
}

let failed = 0;
for (const s of sources) {
  if (ONLY.size && !ONLY.has(s.work)) continue;
  try { await run(s); } catch (e) { failed++; console.error(`${s.work}: ${(e as Error).message}`); }
}
if (failed) { console.error(`\n${failed} source(s) failed; fix src/content/text-sources.yaml and run again.`); process.exit(1); }
