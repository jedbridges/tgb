/**
 * One search module for both consumers, the command palette and the browse island.
 *
 * Pagefind is built at build time and loaded once here. Everything a result needs is in
 * `Hit`, which is shaped so the later phases of docs/search-plan.md add a backend behind
 * `search()` (a second index for passages, an ask mode) without either consumer changing:
 * a passage or an answer source is a hit with different meta, not a new type.
 *
 * Client side only. No framework imports, so the Astro script and the Preact island can
 * both use it.
 */

export type Group = 'Book' | 'Author' | 'Theme' | 'Era' | 'Form' | 'Program' | 'Passage' | 'Page';
export const GROUP_ORDER: Group[] = ['Book', 'Author', 'Theme', 'Era', 'Form', 'Program', 'Passage', 'Page'];
export const GROUP_LABEL: Record<Group, string> = {
  Book: 'Books', Author: 'Authors', Theme: 'Themes', Era: 'Eras', Form: 'Forms', Program: 'Programs', Passage: 'Passages', Page: 'Pages',
};

export interface Hit {
  url: string;
  title: string;
  type: Group;
  excerpt: string;
  /** Every data-pagefind-meta on the page: author, slug, cover, tone, year, difficulty, length, themes… */
  meta: Record<string, string>;
  /** Every data-pagefind-filter on the page, by key. */
  filters: Record<string, string[]>;
}

/** Filter values as Pagefind takes them: a string, a list (all must match) or a composed query. */
export type FilterValue = string | string[] | { any?: string[]; all?: string[]; not?: string | string[] };
export type Filters = Record<string, FilterValue>;

export type Scope = 'guides' | 'text' | 'all';

interface RawResult { id: string; data: () => Promise<{ url: string; excerpt: string; meta: Record<string, string>; filters?: Record<string, string[]> }> }
interface Engine {
  /** A null query lists every page the filters admit, which is how "approachable epic" is answered. */
  search: (q: string | null, o?: { filters?: Filters }) => Promise<{ results: RawResult[] }>;
  init?: () => Promise<void>;
  options?: (o: Record<string, unknown>) => Promise<void>;
}

const INDEX = ['', 'pagefind', 'pagefind.js'].join('/'); // opaque to Vite; built by astro-pagefind
let engine: Promise<Engine | null> | null = null;

/** The one import. Options are set here and nowhere else. */
export function loadSearch(): Promise<Engine | null> {
  return (engine ??= import(/* @vite-ignore */ INDEX)
    .then(async (m: Engine) => {
      await m.options?.({ excerptLength: 32 });
      await m.init?.();
      return m;
    })
    .catch(() => null));
}

/** Warm the engine without searching, for example when the palette opens. */
export const warm = () => { loadSearch(); };

export interface SearchOptions {
  filters?: Filters;
  /** Results to hydrate. Pagefind ranks first and hydrates lazily, so this bounds the fetches. */
  limit?: number;
  /** Reserved for the passage index (phase 2). Only 'guides' exists today. */
  scope?: Scope;
}

/**
 * Words in a query that are really filters.
 *
 * "approachable Greek tragedy" is three facets and no text. Searched as words they match
 * "Epictetus" by prefix and every guide that mentions Greece; searched as filters they
 * return the twelve books that are all three. The table is the site's own vocabulary
 * (src/content/taxonomies, the difficulty and length labels in lib/catalog) plus the
 * words a student would use for them. Ids here must match the data-pagefind-filter
 * values the book page emits.
 */
const ANCIENT = ['ancient-near-east', 'archaic-greece', 'classical-greece', 'hellenistic', 'roman-empire', 'late-antiquity'];
const VOCAB: [string, string, FilterValue][] = [
  ['approachable', 'difficulty', '1'], ['easy', 'difficulty', { any: ['1', '2'] }], ['easiest', 'difficulty', '1'], ['beginner', 'difficulty', { any: ['1', '2'] }],
  ['moderate', 'difficulty', '2'], ['demanding', 'difficulty', '3'], ['difficult', 'difficulty', { any: ['4', '5'] }], ['hard', 'difficulty', { any: ['4', '5'] }],
  ['hardest', 'difficulty', '5'], ['formidable', 'difficulty', '5'],
  ['short', 'length', 'short'], ['shortest', 'length', 'short'], ['medium', 'length', 'medium'], ['long', 'length', { any: ['long', 'epic'] }], ['longest', 'length', 'epic'],
  ['greek', 'language', 'greek'], ['latin', 'language', 'latin'], ['hebrew', 'language', 'hebrew'], ['french', 'language', 'french'], ['german', 'language', 'german'],
  ['italian', 'language', 'italian'], ['spanish', 'language', 'spanish'], ['russian', 'language', 'russian'], ['english', 'language', 'english'], ['chinese', 'language', 'chinese'],
  ['japanese', 'language', 'japanese'], ['sanskrit', 'language', 'sanskrit'], ['arabic', 'language', 'arabic'], ['old english', 'language', 'old-english'], ['middle english', 'language', 'middle-english'],
  ['tragedy', 'genre', 'tragedy'], ['tragedies', 'genre', 'tragedy'], ['comedy', 'genre', 'comedy'], ['comedies', 'genre', 'comedy'], ['play', 'genre', { any: ['tragedy', 'comedy', 'drama'] }], ['plays', 'genre', { any: ['tragedy', 'comedy', 'drama'] }],
  ['novel', 'genre', 'novel'], ['novels', 'genre', 'novel'], ['epic', 'genre', 'epic'], ['epics', 'genre', 'epic'], ['epic poem', 'genre', 'epic'], ['poem', 'genre', { any: ['epic', 'lyric'] }], ['poems', 'genre', { any: ['epic', 'lyric'] }], ['poetry', 'genre', { any: ['epic', 'lyric'] }], ['lyric', 'genre', 'lyric'],
  ['dialogue', 'genre', 'dialogue'], ['dialogues', 'genre', 'dialogue'], ['treatise', 'genre', 'treatise'], ['essay', 'genre', 'essay'], ['essays', 'genre', 'essay'], ['history', 'genre', 'history'], ['histories', 'genre', 'history'],
  ['biography', 'genre', 'biography'], ['memoir', 'genre', 'biography'], ['scripture', 'genre', 'scripture'], ['theology', 'genre', 'theology'], ['political theory', 'genre', 'political-theory'], ['politics', 'genre', 'political-theory'],
  ['satire', 'genre', 'satire'], ['romance', 'genre', 'romance'], ['science', 'genre', 'science'], ['mathematics', 'genre', 'science'], ['economics', 'genre', 'economics'], ['psychology', 'genre', 'psychology'],
  ['letters', 'genre', 'letters'], ['speeches', 'genre', 'letters'], ['founding documents', 'genre', 'founding-document'], ['constitution', 'genre', 'founding-document'],
  ['ancient', 'era', { any: ANCIENT }], ['classical', 'era', { any: ANCIENT }], ['near east', 'era', 'ancient-near-east'], ['archaic', 'era', 'archaic-greece'], ['athenian', 'era', 'classical-greece'], ['hellenistic', 'era', 'hellenistic'],
  ['roman', 'era', { any: ['roman-empire', 'hellenistic'] }], ['late antiquity', 'era', 'late-antiquity'], ['medieval', 'era', 'medieval'], ['middle ages', 'era', 'medieval'], ['renaissance', 'era', 'renaissance'],
  ['seventeenth century', 'era', 'seventeenth-century'], ['17th century', 'era', 'seventeenth-century'], ['enlightenment', 'era', 'enlightenment'], ['eighteenth century', 'era', 'enlightenment'], ['18th century', 'era', 'enlightenment'],
  ['nineteenth century', 'era', 'nineteenth-century'], ['19th century', 'era', 'nineteenth-century'], ['victorian', 'era', 'nineteenth-century'], ['twentieth century', 'era', 'twentieth-century'], ['20th century', 'era', 'twentieth-century'], ['modern', 'era', { any: ['twentieth-century', 'twenty-first-century'] }],
  ['twenty-first century', 'era', 'twenty-first-century'], ['21st century', 'era', 'twenty-first-century'], ['contemporary', 'era', 'twenty-first-century'],
];
const VOCAB_BY_LEN = [...VOCAB].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);

export interface Parsed { text: string; filters: Filters; matched: string[] }

/**
 * Split a query into the words to search and the facets it named. A single facet word
 * on its own ("tragedy") is left as text, so the Form page and the books both come back;
 * the parser only steps in when there is something to combine.
 */
export function parseQuery(q: string): Parsed {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2) return { text: q.trim(), filters: {}, matched: [] };
  const filters: Filters = {}; const matched: string[] = []; const rest: string[] = [];
  let i = 0;
  outer: while (i < words.length) {
    for (const [phrase, key, value] of VOCAB_BY_LEN) {
      const n = phrase.split(' ').length;
      if (words.slice(i, i + n).join(' ') === phrase && !(key in filters)) {
        filters[key] = value; matched.push(phrase); i += n; continue outer;
      }
    }
    rest.push(words[i]); i++;
  }
  if (!matched.length) return { text: q.trim(), filters: {}, matched: [] };
  return { text: rest.join(' '), filters: { type: 'Book', ...filters }, matched };
}

/** Null when the index could not load, an empty list when nothing matched. */
export async function search(q: string, opts: SearchOptions = {}): Promise<Hit[] | null> {
  const parsed = parseQuery(q);
  const filters = { ...parsed.filters, ...(opts.filters ?? {}) };
  const text = parsed.text || null;
  if (!text && !Object.keys(filters).length) return [];
  const pf = await loadSearch();
  if (!pf) return null;
  const res = await pf.search(text, Object.keys(filters).length ? { filters } : undefined);
  const raw = await Promise.all(res.results.slice(0, opts.limit ?? 24).map((r) => r.data()));
  /* A query no word matches is still answered by Pagefind with pages that share the first
     two letters of it ("Neitzsche" marks "ne"), which is not a result. A hit has to mark
     a real fraction of some word that was typed. */
  const shortest = Math.min(...(text ?? '').split(/\s+/).filter(Boolean).map((w) => w.length));
  const need = Math.max(3, Math.ceil(shortest * 0.6));
  const real = (excerpt: string) => [...excerpt.matchAll(/<mark>([^<]+)<\/mark>/g)].some((m) => m[1].replace(/[^\p{L}\p{N}]/gu, '').length >= need);
  const hits = raw
    .filter((r) => !text || real(r.excerpt))
    .map((r) => ({
      url: r.url,
      title: r.meta.title || 'Untitled',
      type: (r.meta.type as Group) || 'Page',
      excerpt: r.excerpt,
      meta: r.meta,
      filters: r.filters ?? {},
    }));
  /* The page named by the query comes first. Ranking by term density puts Plato's Laws
     above Plato himself, because a dialogue names its author more often than his own
     page does; a reader who typed "Plato" wanted Plato. */
  if (text) {
    const want = plain(text);
    const exact = hits.filter((h) => plain(h.title) === want);
    if (exact.length) return [...exact, ...hits.filter((h) => !exact.includes(h))];
  }
  return hits;
}
const plain = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Hits by group. Groups are ordered by their best hit, so a search for "Plato" leads
 * with the author when the author page outranks his dialogues and with the books when
 * it does not, rather than always putting books first.
 */
export function groupHits(hits: Hit[], cap: Partial<Record<Group, number>> = {}): { group: Group; label: string; hits: Hit[] }[] {
  const by = new Map<Group, { first: number; hits: Hit[] }>();
  hits.forEach((h, i) => {
    const g = GROUP_ORDER.includes(h.type) ? h.type : 'Page';
    const entry = by.get(g) ?? { first: i, hits: [] };
    if (entry.hits.length < (cap[g] ?? Infinity)) entry.hits.push(h);
    by.set(g, entry);
  });
  return [...by.entries()].sort((a, b) => a[1].first - b[1].first).map(([g, e]) => ({ group: g, label: GROUP_LABEL[g], hits: e.hits }));
}

/** The browse page URL that shows the same thing, for "see every book that matches". */
export function browseUrl(q: string): string {
  const { text, filters } = parseQuery(q);
  const p = new URLSearchParams();
  if (text) p.set('q', text);
  for (const [k, v] of Object.entries(filters)) if (k !== 'type' && typeof v === 'string') p.set(k, v);
  const qs = p.toString();
  return '/books/' + (qs ? `?${qs}` : '');
}

/**
 * Names close to what was typed, for the empty state. Prefix match on any word first,
 * then a loose match that forgives one wrong or missing letter per word, which covers
 * "Dostoevski", "Neitzsche" and "Aristotel" without shipping a fuzzy search library.
 */
export function suggestFor(q: string, names: string[], limit = 3): string[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const score = (name: string) => {
    const parts = name.toLowerCase().split(/[\s,.'-]+/);
    let best = 0;
    for (const w of words) for (const p of parts) {
      if (p.startsWith(w)) best = Math.max(best, 3);
      else if (w.length >= 4 && p.length >= 4 && editDistance(w, p.slice(0, w.length + 1)) <= 1) best = Math.max(best, 2);
      else if (w.length >= 5 && editDistance(w, p) <= 2) best = Math.max(best, 1);
    }
    return best;
  };
  return names.map((n) => ({ n, s: score(n) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.n.localeCompare(b.n)).slice(0, limit).map((x) => x.n);
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

/** The browse island's facet state, as far as this module needs to know it. */
export interface FacetState {
  program?: string; segment?: string; theme?: string[]; genre?: string; era?: string; region?: string;
  language?: string; author?: string; difficulty?: string; length?: string; guide?: string;
}

/**
 * Facet state to Pagefind filters, so a text search on the browse page is narrowed by the
 * same facets the grid is. Keys and values match the data-pagefind-filter attributes on
 * the book page, which carry ids, not labels. Reused as-is by the passage scope later.
 */
export function facetsToFilters(s: FacetState): Filters {
  const f: Filters = { type: 'Book' };
  if (s.program) f.program = s.program;
  if (s.program && s.segment) f.segment = `${s.program}/${s.segment}`;
  if (s.theme?.length) f.theme = s.theme;
  if (s.genre) f.genre = s.genre;
  if (s.era) f.era = s.era;
  if (s.region) f.region = s.region;
  if (s.language) f.language = s.language;
  if (s.author) f.author = s.author;
  if (s.difficulty) f.difficulty = s.difficulty;
  if (s.length) f.length = s.length;
  if (s.guide) f.guide = s.guide;
  return f;
}

/** Difficulty number to the word the site uses everywhere. */
export const DIFFICULTY_WORD = ['', 'Approachable', 'Moderate', 'Demanding', 'Difficult', 'Formidable'];
export const LENGTH_WORD: Record<string, string> = { short: 'Short', medium: 'Medium', long: 'Long', epic: 'Epic' };
