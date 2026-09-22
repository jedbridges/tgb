import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import coversMeta from '~/assets/covers.json';

export type Work = CollectionEntry<'works'>;
export type Author = CollectionEntry<'authors'>;
export type Program = CollectionEntry<'programs'>;

export interface CoverMeta { w: number; h: number; spine: string; spineInk: string; source?: string }
const coverFiles = import.meta.glob<{ default: ImageMetadata }>('/src/assets/covers/*.{jpg,jpeg,png,webp}', { eager: true });

export function coverFor(slug: string): { image: ImageMetadata | null; meta: CoverMeta | null } {
  const hit = Object.entries(coverFiles).find(([p]) => p.replace(/^.*\//, '').replace(/\.[a-z]+$/, '') === slug);
  const meta = (coversMeta as Record<string, CoverMeta>)[slug] ?? null;
  return { image: hit ? hit[1].default : null, meta };
}

let _cache: Promise<{
  works: Work[]; authors: Map<string, Author>; programs: Program[];
  assigned: Map<string, { program: Program; segment: Program['data']['segments'][number]; note?: string; optional: boolean }[]>;
}> | null = null;

export function loadCatalog() {
  if (_cache) return _cache;
  _cache = (async () => {
    const [works, authorsArr, programsArr] = await Promise.all([
      getCollection('works'), getCollection('authors'), getCollection('programs'),
    ]);
    const authors = new Map(authorsArr.map((a) => [a.id, a]));
    const programs = programsArr.sort((a, b) => a.data.order - b.data.order);
    const assigned = new Map<string, { program: Program; segment: Program['data']['segments'][number]; note?: string; optional: boolean }[]>();
    for (const program of programs) {
      for (const segment of [...program.data.segments].sort((a, b) => a.order - b.order)) {
        for (const item of segment.items) {
          const list = assigned.get(item.work.id) ?? [];
          list.push({ program, segment, note: item.note, optional: item.optional });
          assigned.set(item.work.id, list);
        }
      }
    }
    return { works, authors, programs, assigned };
  })();
  return _cache;
}

export async function programsForWork(slug: string) {
  const { assigned } = await loadCatalog();
  return assigned.get(slug) ?? [];
}
export async function programCount(slug: string) {
  const { assigned } = await loadCatalog();
  return new Set((assigned.get(slug) ?? []).map((a) => a.program.id)).size;
}
/** Placeholder so a missing author file degrades gracefully instead of breaking the build.
 *  scripts/validate-content.ts errors on any work whose author file is absent. */
export function placeholderAuthor(id: string): Author {
  const name = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return {
    id, body: '', collection: 'authors', rendered: undefined,
    data: {
      name, sortName: name, aliases: [], region: { id: 'other', collection: 'regions' },
      language: { id: 'other', collection: 'languages' }, era: { id: 'medieval', collection: 'eras' }, status: 'stub',
    },
  } as unknown as Author;
}
export async function authorOf(work: Work) {
  const { authors } = await loadCatalog();
  return authors.get(work.data.author.id) ?? placeholderAuthor(work.data.author.id);
}
export async function authorName(id: string) {
  const { authors } = await loadCatalog();
  return authors.get(id)?.data.name ?? placeholderAuthor(id).data.name;
}

/** A work "has a guide" once it carries the written summary, not just the catalogue entry. */
export const hasGuide = (w: Work) => w.data.status !== 'stub';

export async function guidedCount() {
  const { works } = await loadCatalog();
  return works.filter(hasGuide).length;
}

export const yearLabel = (w: Work) => w.data.yearDisplay ?? (w.data.year < 0 ? `${-w.data.year} BCE` : `${w.data.year}`);

/** Compact year for cards and rows. Long editorial yearDisplay strings ("written c. 1513, published 1532")
 *  are reduced to their first date; the full string still shows on the work page. */
export function yearShort(w: Work): string {
  const plain = w.data.year < 0 ? `${-w.data.year} BCE` : `${w.data.year}`;
  const d = w.data.yearDisplay;
  if (!d) return plain;
  if (d.length <= 14) return d;
  const era = (m: string | undefined) => {
    const e = (m ?? '').trim().toUpperCase();
    if (e.startsWith('BC')) return ' BCE';
    if (e === 'CE' || e === 'AD') return ' CE';
    return w.data.year < 0 ? ' BCE' : '';
  };
  const yearMatch = d.match(/(c\.\s*)?(\d{3,4})(?!\s*(?:st|nd|rd|th))\s*(BCE|BC|CE|AD)?/i);
  const centMatch = d.match(/(c\.\s*)?(\d{1,2})(st|nd|rd|th)[\s-]*(?:to|-)?\s*(?:\d{1,2}(?:st|nd|rd|th))?\s*century\s*(BCE|BC|CE|AD)?/i);
  // whichever date the sentence mentions first is the one it is really about
  const yi = yearMatch?.index ?? Infinity;
  const ci = centMatch?.index ?? Infinity;
  if (ci <= yi && centMatch) return `${centMatch[1] ? 'c. ' : ''}${centMatch[2]}${centMatch[3]} c.${era(centMatch[4])}`;
  if (yearMatch) return `${yearMatch[1] ? 'c. ' : ''}${yearMatch[2]}${era(yearMatch[3])}`;
  return plain;
}

export const lengthLabel: Record<Work['data']['length'], string> = { short: 'Short', medium: 'Medium', long: 'Long', epic: 'Epic' };
export const lengthHint: Record<Work['data']['length'], string> = { short: 'under 120 pages', medium: '120 to 300 pages', long: '300 to 700 pages', epic: 'over 700 pages' };
export const difficultyLabel = (d: number) => ['', 'Approachable', 'Moderate', 'Demanding', 'Difficult', 'Formidable'][d] ?? '';

export async function sortedByAssignment(works: Work[]) {
  const { assigned } = await loadCatalog();
  const count = (w: Work) => new Set((assigned.get(w.id) ?? []).map((a) => a.program.id)).size;
  return [...works].sort((a, b) => count(b) - count(a) || a.data.year - b.data.year || a.data.title.localeCompare(b.data.title));
}

export async function relatedWorks(work: Work, limit = 6): Promise<Work[]> {
  const { works, assigned } = await loadCatalog();
  if (work.data.related.length) {
    const picks = await Promise.all(work.data.related.map((r) => getEntry('works', r.id)));
    return picks.filter(Boolean) as Work[];
  }
  const mine = new Set(work.data.themes.map((t) => t.id));
  const myPrograms = new Set((assigned.get(work.id) ?? []).map((a) => `${a.program.id}/${a.segment.id}`));
  const scored = works
    .filter((w) => w.id !== work.id)
    .map((w) => {
      let s = 0;
      for (const t of w.data.themes) if (mine.has(t.id)) s += 2;
      if (w.data.genre.id === work.data.genre.id) s += 2;
      if (w.data.era.id === work.data.era.id) s += 1;
      if (w.data.author.id === work.data.author.id) s += 3;
      for (const a of assigned.get(w.id) ?? []) if (myPrograms.has(`${a.program.id}/${a.segment.id}`)) s += 1.5;
      return { w, s };
    })
    .sort((a, b) => b.s - a.s || a.w.data.year - b.w.data.year);
  return scored.slice(0, limit).map((x) => x.w);
}

/** Compact row for the client-side browse index. Keys are short on purpose. */
export async function catalogRecord(w: Work) {
  const { authors, assigned } = await loadCatalog();
  const a = authors.get(w.data.author.id) ?? placeholderAuthor(w.data.author.id);
  const progs = assigned.get(w.id) ?? [];
  return {
    s: w.id,
    t: w.data.title,
    a: a?.data.name ?? '',
    as: a?.data.sortName ?? '',
    y: w.data.year,
    e: w.data.era.id,
    g: [w.data.genre.id, ...w.data.genres.map((g) => g.id)],
    th: w.data.themes.map((t) => t.id),
    d: w.data.difficulty,
    l: w.data.length,
    lang: w.data.language.id,
    r: w.data.region.id,
    p: [...new Set(progs.map((x) => x.program.id))],
    ps: [...new Set(progs.map((x) => `${x.program.id}/${x.segment.id}`))],
    pc: new Set(progs.map((x) => x.program.id)).size,
    au: w.data.author.id,
    hg: hasGuide(w) ? 1 : 0,
  };
}
export type CatalogRow = Awaited<ReturnType<typeof catalogRecord>>;
