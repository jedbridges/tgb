/**
 * Where each passage the guide marks falls in the public domain text.
 *
 * A guide marks up to six passages, each with a location in the work's own terms ("Book 1,
 * 338c", "Act 3, scene 1", "Chapter 12") and the words of the translator the programs
 * assign. The text on the site is an older translation, so the words rarely match exactly,
 * but the structure does: the location names a book, act, scene or chapter, and the section
 * headings carry the same numbers. Where the location narrows the field to several sections
 * (a book split into chapters), or names none, the passage's own words decide: the section
 * that shares the most of its word pairs is the one.
 *
 * The result is what turns a section of Gutenberg text into a page of ours: the passage,
 * the guide's note and a link back to the guide sit under the text, and only then does the
 * section join the sitemap (docs/search-plan.md, 2d). Read from disk rather than the content
 * layer because astro.config needs the same answer for the sitemap before that layer exists.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export interface Highlight { text: string; location?: string; translator?: string; note?: string }
export interface TextSection { section: string; heading: string; order: number; body: string }
export interface Placed { index: number; highlight: Highlight; section: string; score: number }

const STOP = new Set('the a an and or of to in on at by for with from as but nor is are was were be been it its he she they them his her their this that these those not no you your we our us i me my what which who whom how when where why all any some there here than then so if into upon out up down over under about after before again shall will would could should may might must have has had do does did says said'.split(' '));
const words = (s: string) => s.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

const ROMAN: [string, number][] = [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]];
function toNumber(s: string): number | undefined {
  if (/^\d+$/.test(s)) return Number(s);
  if (!/^[ivxlcdm]+$/i.test(s)) return undefined;
  let t = s.toLowerCase(), n = 0;
  for (const [r, v] of ROMAN) while (t.startsWith(r)) { n += v; t = t.slice(r.length); }
  return t ? undefined : n;
}
const UNITS = ['book', 'part', 'act', 'scene', 'chapter', 'canto', 'letter', 'essay', 'section', 'volume', 'meditation', 'article', 'amendment'];
const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** "Act 3, scene 1", "Book I" and "First Section" alike become { act: 3, scene: 1 }, { book: 1 } and { section: 1 }. */
function units(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  const nums = `[ivxlcdm]+|\\d+|${Object.keys(ORDINAL_WORDS).join('|')}`;
  const after = new RegExp(`\\b(${UNITS.join('|')})s?\\s+(?:the\\s+)?(${nums})\\b`, 'gi');
  const before = new RegExp(`\\b(${Object.keys(ORDINAL_WORDS).join('|')})\\s+(${UNITS.join('|')})\\b`, 'gi');
  for (const m of s.matchAll(after)) {
    const n = toNumber(m[2]) ?? ORDINAL_WORDS[m[2].toLowerCase()];
    if (n !== undefined && !(m[1].toLowerCase() in out)) out[m[1].toLowerCase()] = n;
  }
  for (const m of s.matchAll(before)) if (!(m[2].toLowerCase() in out)) out[m[2].toLowerCase()] = ORDINAL_WORDS[m[1].toLowerCase()];
  // A heading that opens with a bare number, "II: Concerning Hereditary Principalities", is a chapter.
  const lead = s.match(/^\s*([ivxlcdm]+|\d+)\s*[:.]\s+\S/i);
  if (lead && !Object.keys(out).length) { const n = toNumber(lead[1]); if (n !== undefined) out.chapter = n; }
  return out;
}
/* A guide's "Volume I" is a text's "Book I"; the top level of a work goes by several names. */
const ALIAS: Record<string, string[]> = { volume: ['book', 'part'], book: ['volume', 'part'], part: ['book', 'volume'], meditation: ['part'], section: ['chapter'], chapter: ['section'] };
/** How many of the location's units the heading agrees with, or -1 if it contradicts one it names. */
function agreement(want: Record<string, number>, have: Record<string, number>): number {
  let n = 0;
  for (const [k, v] of Object.entries(want)) {
    if (have[k] !== undefined) { if (have[k] !== v) return -1; n++; continue; }
    const alias = (ALIAS[k] ?? []).find((a) => have[a] !== undefined);
    if (alias && have[alias] === v) n++;
  }
  return n;
}
/** Words in a location that name a part of the work by title, "Purgatorio" or "Agamemnon", and appear in some heading. */
const titleWords = (location: string, headings: string[]) => {
  const ws = location.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !UNITS.includes(w) && !(w in ORDINAL_WORDS) && !['line', 'lines', 'opening', 'closing', 'chapters', 'section', 'sections', 'fragment', 'scene', 'throughout', 'before', 'after', 'final', 'spoken', 'chorus', 'sentence', 'paragraph', 'clause', 'notes', 'lafuma', 'brunschvicg', 'madison', 'hamilton'].includes(w));
  return ws.filter((w) => headings.some((h) => new RegExp(`\\b${w}\\b`).test(h)));
};

const bigrams = (ws: string[]) => { const s = new Set<string>(); for (let i = 1; i < ws.length; i++) s.add(`${ws[i - 1]} ${ws[i]}`); return s; };

/** Place every highlight that can be placed; a paraphrase with no structural location and no shared words is left out. */
export function locateHighlights(highlights: Highlight[], sections: TextSection[]): Placed[] {
  const prepared = sections.map((s) => { const ws = words(s.body); return { s, h: s.heading.toLowerCase(), u: units(s.heading), set: new Set(ws), bi: bigrams(ws) }; });
  const headings = prepared.map((p) => p.h);
  const out: Placed[] = [];
  highlights.forEach((h, index) => {
    const location = h.location ?? '';
    const want = units(location);
    // Candidates by structure: the headings that agree with the most of the location's units
    // and contradict none; a title word in the location ("Purgatorio") narrows them first.
    let pool = prepared;
    const titles = titleWords(location, headings);
    if (titles.length) { const t = pool.filter((p) => titles.every((w) => new RegExp(`\\b${w}\\b`).test(p.h))); if (t.length) pool = t; }
    let cands: typeof prepared = [];
    if (Object.keys(want).length) {
      const scored = pool.map((p) => ({ p, n: agreement(want, p.u) })).filter((x) => x.n > 0);
      const top = Math.max(0, ...scored.map((x) => x.n));
      cands = scored.filter((x) => x.n === top).map((x) => x.p);
    } else if (titles.length && pool.length < prepared.length) cands = pool;
    const qw = words(h.text); const qb = bigrams(qw); const qs = new Set(qw);
    const score = (p: (typeof prepared)[number]) => {
      let b = 0; for (const x of qb) if (p.bi.has(x)) b++;
      let u = 0; for (const x of qs) if (p.set.has(x)) u++;
      return 0.6 * (qb.size ? b / qb.size : 0) + 0.4 * (qs.size ? u / qs.size : 0);
    };
    const field = cands.length ? cands : prepared;
    let best: (typeof prepared)[number] | undefined; let bestScore = -1;
    for (const p of field) { const sc = score(p); if (sc > bestScore) { bestScore = sc; best = p; } }
    if (!best) return;
    // One structural candidate is the answer whatever the words say; several need the words to
    // choose, or else the first of them; no structure at all, or a structure the text does not
    // have (Book 7 of a Books I to IV edition), needs the words to be sure.
    const threshold = cands.length === 1 ? -1 : cands.length > 1 ? 0.15 : Object.keys(want).length ? 0.5 : 0.4;
    if (bestScore >= threshold) out.push({ index, highlight: h, section: best.s.section, score: bestScore });
    else if (cands.length > 1) out.push({ index, highlight: h, section: cands[0].s.section, score: bestScore });
  });
  return out;
}

/* Disk readers, for the config and the pages alike. */
function frontMatter(file: string): Record<string, unknown> {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { ...(parseYaml(m[1]) as Record<string, unknown>), body: m[2] } : { body: src };
}

let cache: Map<string, Placed[]> | null = null;
/** Work slug to its placed highlights, computed once per process. */
export function textMap(): Map<string, Placed[]> {
  if (cache) return cache;
  cache = new Map();
  const root = 'src/content/texts';
  if (!existsSync(root)) return cache;
  for (const work of readdirSync(root, { withFileTypes: true })) {
    if (!work.isDirectory()) continue;
    const wf = `src/content/works/${work.name}.md`;
    if (!existsSync(wf)) continue;
    const highlights = ((frontMatter(wf).highlights as Highlight[] | undefined) ?? []).filter((h) => h && h.text);
    if (!highlights.length) continue;
    const sections: TextSection[] = readdirSync(`${root}/${work.name}`).filter((f) => f.endsWith('.md')).map((f) => {
      const fm = frontMatter(`${root}/${work.name}/${f}`);
      return { section: String(fm.section), heading: String(fm.heading ?? ''), order: Number(fm.order ?? 0), body: String(fm.body ?? '') };
    }).sort((a, b) => a.order - b.order);
    cache.set(work.name, locateHighlights(highlights, sections));
  }
  return cache;
}

/** The passages placed in one section of one work. */
export function passagesIn(work: string, section: string): Placed[] {
  return (textMap().get(work) ?? []).filter((p) => p.section === section);
}

/** Whether a text page is one of ours to index: a section with commentary, or the contents of a work that has any. */
export function textPageIndexable(path: string): boolean {
  const m = path.replace(/\/$/, '').match(/^\/books\/([^/]+)\/text(?:\/([^/]+))?$/);
  if (!m) return false;
  const placed = textMap().get(m[1]) ?? [];
  return m[2] ? placed.some((p) => p.section === m[2]) : placed.length > 0;
}
