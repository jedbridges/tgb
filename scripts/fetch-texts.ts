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

interface Source { work: string; source: 'standardebooks' | 'gutenberg'; url: string; edition: string; translator?: string }
interface Section { heading: string; body: string }

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
  if (node.nodeType === 3) return decode(node.rawText).replace(/\s+/g, ' ');
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (!tag) return el.childNodes.map(textOf).join('');
  if (['script', 'style', 'sup', 'aside', 'nav', 'img', 'figure'].includes(tag)) return '';
  if (el.getAttribute('epub:type')?.includes('noteref') || el.classList?.contains('pagenum')) return '';
  const inner = el.childNodes.map(textOf).join('');
  if (tag === 'em' || tag === 'i') return inner.trim() ? `*${inner.trim()}*` : '';
  if (tag === 'br') return '\n';
  if (tag === 'p') {
    // Verse: Standard Ebooks marks lines with <span> inside <p>; Gutenberg often uses <br>.
    const lines = el.querySelectorAll(':scope > span');
    const isVerse = lines.length > 1 || el.classList?.contains('verse') || el.classList?.contains('poem');
    const text = isVerse ? lines.length > 1 ? lines.map((l) => textOf(l).trim()).join('  \n') : inner.split('\n').map((l) => l.trim()).filter(Boolean).join('  \n') : inner.replace(/\s+/g, ' ').trim();
    return text ? `\n\n${text}\n\n` : '';
  }
  if (tag === 'blockquote') return `\n\n${inner.trim().split(/\n{2,}/).map((p) => '> ' + p.replace(/\n/g, '\n> ')).join('\n>\n')}\n\n`;
  if (/^h[1-6]$/.test(tag)) return '';
  if (['div', 'section', 'article', 'body', 'html', 'header', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'hr'].includes(tag)) return `\n\n${inner}\n\n`;
  return inner;
}
const tidy = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function headingText(el: HTMLElement): string {
  // Standard Ebooks headings carry an ordinal and a title in separate spans: "Book I" / "The Anger of Achilles".
  const parts = el.querySelectorAll('span').map((s) => decode(s.text).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const raw = parts.length >= 2 ? parts.slice(0, 2).join(': ') : decode(el.text).replace(/\s+/g, ' ').trim();
  return raw.replace(/\s*:\s*$/, '');
}

function splitStandardEbooks(html: string): Section[] {
  const root = parseHtml(html, { blockTextElements: { script: false, style: false } });
  const body = root.querySelector('body') ?? root;
  const sections: Section[] = [];
  const leaves = body.querySelectorAll('section, article').filter((s) => !s.querySelector('section, article'));
  for (const s of leaves) {
    const type = s.getAttribute('epub:type') ?? '';
    if (/titlepage|imprint|colophon|copyright|toc|loi|dedication|halftitlepage|frontmatter|backmatter|endnotes|bibliography|glossary/.test(type)) continue;
    const h = s.querySelector('h1, h2, h3, h4, h5, h6, header');
    const heading = h ? headingText(h) : '';
    const bodyText = tidy(textOf(s));
    if (!bodyText) continue;
    sections.push({ heading, body: bodyText });
  }
  return sections;
}

function splitGutenberg(html: string): Section[] {
  const root = parseHtml(html, { blockTextElements: { script: false, style: false } });
  const body = root.querySelector('body') ?? root;
  // Drop the licence and boilerplate that Gutenberg wraps around the text.
  for (const sel of ['#pg-header', '#pg-footer', '.pg-boilerplate', 'pre']) body.querySelectorAll(sel).forEach((n) => n.remove());
  const sections: Section[] = [];
  let cur: { heading: string; parts: string[] } | null = null;
  const flush = () => { if (cur) { const b = tidy(cur.parts.join('')); if (b) sections.push({ heading: cur.heading, body: b }); } };
  const walk = (n: Node) => {
    const el = n as HTMLElement;
    const tag = el.tagName?.toLowerCase();
    if (tag && /^h[1-4]$/.test(tag)) {
      flush();
      cur = { heading: decode(el.text).replace(/\s+/g, ' ').trim(), parts: [] };
      return;
    }
    if (tag && ['p', 'blockquote', 'ul', 'ol', 'table'].includes(tag)) { if (cur) cur.parts.push(textOf(el)); return; }
    for (const c of el.childNodes ?? []) walk(c);
  };
  walk(body);
  flush();
  // Everything before the first real chapter (title, contents, preface headings with no text) goes.
  return sections;
}

/* Fold short sections into the one before, and drop the front matter that survives the
   type filters (a table of contents rendered as a section, a two line epigraph). */
function fold(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    if (/^(contents|table of contents|preface to the|list of illustrations|index)$/i.test(s.heading)) continue;
    if (out.length && words(s.body) < MIN_WORDS) { out[out.length - 1].body += `\n\n**${s.heading}**\n\n${s.body}`; continue; }
    out.push({ ...s });
  }
  if (out.length && words(out[0].body) < MIN_WORDS && out.length > 1) { out[1].body = `**${out[0].heading}**\n\n${out[0].body}\n\n${out[1].body}`; out.shift(); }
  return out;
}

const slugify = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';

async function run(s: Source) {
  const url = pageUrl(s);
  const html = await fetchCached(url, `${s.work}`);
  const raw = s.source === 'standardebooks' ? splitStandardEbooks(html) : splitGutenberg(html);
  const sections = fold(raw);
  const total = sections.reduce((n, x) => n + words(x.body), 0);
  console.log(`${s.work}: ${sections.length} sections, ${total.toLocaleString()} words${DRY ? ' (dry)' : ''}`);
  if (DRY || !sections.length) { if (!sections.length) console.warn(`  ! nothing parsed from ${url}`); return; }
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
      `work: ${s.work}`, `section: ${id}`, `heading: ${q(sec.heading || `Part ${i + 1}`)}`, `order: ${i + 1}`,
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
