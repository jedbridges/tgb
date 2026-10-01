import { getCollection } from 'astro:content';
import { textUrl } from './url';
import type { Work } from './catalog';

/** Where a free copy lives: on this site, or on someone else's. */
export interface FreeRead {
  /** 'here' when we host the text; otherwise the host we send the reader to. */
  where: 'here' | 'standardebooks' | 'gutenberg' | 'wikisource' | 'archive';
  url: string;
  /** "Samuel Butler's prose translation, 1898". */
  edition: string;
  translator?: string;
  /** Whether the link leaves the site, which decides target and rel. */
  external: boolean;
}

export const SOURCE_NAME: Record<string, string> = {
  here: 'this site',
  standardebooks: 'Standard Ebooks',
  gutenberg: 'Project Gutenberg',
  wikisource: 'Wikisource',
  archive: 'Internet Archive',
};

/** The hosts a free link may point at. Anything else is a mistake, and the build says so. */
export const FREE_HOSTS = ['standardebooks.org', 'www.gutenberg.org', 'en.wikisource.org', 'archive.org'];

let cache: Promise<Map<string, FreeRead>> | null = null;

/**
 * One free read per work, hosted first.
 *
 * A work we host is always the better link: it opens in the site's own typography, beside
 * the guide, with the marked passages in place. The external list is for everything else,
 * and a work in both is only ever shown as hosted.
 */
export function loadFreeReads() {
  if (cache) return cache;
  cache = (async () => {
    const [texts, sources] = await Promise.all([getCollection('texts'), getCollection('freeSources')]);
    const map = new Map<string, FreeRead>();
    for (const s of sources) {
      map.set(s.data.work.id, {
        where: s.data.source, url: s.data.url, edition: s.data.edition, translator: s.data.translator, external: true,
      });
    }
    // Hosted texts win. Count the sections per work: a work with only one (the Phaedo, the
    // Gospel of John) has a contents page that is a single link, a dead-feeling stop between
    // the reader and the text, so its "read" link goes straight to the section instead.
    const sectionCount = new Map<string, number>();
    for (const t of texts) sectionCount.set(t.data.work.id, (sectionCount.get(t.data.work.id) ?? 0) + 1);
    const seen = new Set<string>();
    for (const t of texts) {
      const id = t.data.work.id;
      if (seen.has(id)) continue;
      seen.add(id);
      map.set(id, {
        where: 'here',
        url: sectionCount.get(id) === 1 ? textUrl(id, t.data.section) : textUrl(id),
        edition: t.data.edition, translator: t.data.translator, external: false,
      });
    }
    return map;
  })();
  return cache;
}

export async function freeReadFor(slug: string) {
  return (await loadFreeReads()).get(slug);
}

/**
 * Whether to offer the recommended edition next to a free one.
 *
 * The free text is nearly always an older translation, so the two are different books and
 * the offer is useful. When they are the same translator it is neither useful nor honest,
 * and the row just says the book is free.
 */
export function upsellWorthIt(work: Work, free: FreeRead | undefined) {
  const rec = work.data.recommendedEdition;
  if (!free || !rec) return false;
  if (!rec.translator && !rec.editor && !rec.publisher) return false;
  const same = free.translator && rec.translator && free.translator.toLowerCase().includes(rec.translator.toLowerCase().split(' ').pop() ?? '');
  return !same;
}
