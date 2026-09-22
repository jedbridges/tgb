/** Browse island: facet filters + sort + Pagefind text search over the SSR'd card grid. State lives in the URL. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CatalogRow } from '~/lib/catalog';

type Facet = { id: string; label: string };
type Facets = {
  programs: (Facet & { segments: Facet[] })[];
  themes: Facet[]; genres: Facet[]; eras: Facet[]; regions: Facet[]; languages: Facet[]; authors: Facet[];
};
type Sort = 'assigned' | 'chronological' | 'title' | 'author' | 'difficulty';
interface State {
  q: string; program: string; segment: string; theme: string[]; genre: string; era: string; region: string; language: string;
  author: string; difficulty: string; length: string; guide: string; sort: Sort;
}
const EMPTY: State = { q: '', program: '', segment: '', theme: [], genre: '', era: '', region: '', language: '', author: '', difficulty: '', length: '', guide: '', sort: 'assigned' };

const DIFFICULTY = ['Approachable', 'Moderate', 'Demanding', 'Difficult', 'Formidable'];
const LENGTH: Facet[] = [
  { id: 'short', label: 'Short, under 120 pp' },
  { id: 'medium', label: 'Medium, 120 to 300 pp' },
  { id: 'long', label: 'Long, 300 to 700 pp' },
  { id: 'epic', label: 'Epic, over 700 pp' },
];

function fromUrl(): State {
  if (typeof location === 'undefined') return EMPTY;
  const p = new URLSearchParams(location.search);
  return {
    ...EMPTY,
    q: p.get('q') ?? '', program: p.get('program') ?? '', segment: p.get('segment') ?? '',
    theme: p.getAll('theme'), genre: p.get('genre') ?? '', era: p.get('era') ?? '', region: p.get('region') ?? '',
    language: p.get('language') ?? '', author: p.get('author') ?? '', difficulty: p.get('difficulty') ?? '',
    length: p.get('length') ?? '', guide: p.get('guide') ?? '',
    sort: (p.get('sort') as Sort) || 'assigned',
  };
}
function toUrl(s: State) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (k === 'sort' && v === 'assigned') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else if (v) p.set(k, v as string);
  }
  const qs = p.toString();
  return location.pathname + (qs ? `?${qs}` : '');
}

type PF = { search: (q: string) => Promise<{ results: { data: () => Promise<{ meta: Record<string, string>; url: string }> }[] }>; init?: () => Promise<void> };
let pf: Promise<PF | null> | null = null;
const PF_PATH = ['', 'pagefind', 'pagefind.js'].join('/');
const loadPf = () => (pf ??= import(/* @vite-ignore */ PF_PATH).then(async (m: any) => { await m.init?.(); return m as PF; }).catch(() => null));

export default function Browse({ rows, facets, total }: { rows: CatalogRow[]; facets: Facets; total: number }) {
  const [s, setS] = useState<State>(EMPTY);
  const [hits, setHits] = useState<Map<string, number> | null>(null); // slug -> rank when q active
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const first = useRef(true);

  useEffect(() => { setS(fromUrl()); }, []);
  useEffect(() => {
    const onPop = () => setS(fromUrl());
    addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop);
  }, []);

  // text search
  useEffect(() => {
    const q = s.q.trim();
    if (!q) { setHits(null); return; }
    let live = true; setSearching(true);
    const t = setTimeout(async () => {
      const engine = await loadPf();
      if (!engine || !live) { setSearching(false); if (!engine) setHits(new Map()); return; }
      const res = await engine.search(q);
      const top = await Promise.all(res.results.slice(0, 200).map((r) => r.data()));
      if (!live) return;
      const m = new Map<string, number>();
      top.forEach((h, i) => { const slug = h.meta?.slug || h.url.match(/\/books\/([^/]+)\//)?.[1]; if (slug && !m.has(slug)) m.set(slug, i); });
      setHits(m); setSearching(false);
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [s.q]);

  const visible = useMemo(() => {
    let list = rows.filter((r) =>
      (!s.program || r.p.includes(s.program)) &&
      (!s.segment || !s.program || r.ps.includes(`${s.program}/${s.segment}`)) &&
      s.theme.every((t) => r.th.includes(t)) &&
      (!s.genre || r.g.includes(s.genre)) &&
      (!s.era || r.e === s.era) &&
      (!s.region || r.r === s.region) &&
      (!s.language || r.lang === s.language) &&
      (!s.author || r.au === s.author) &&
      (!s.difficulty || String(r.d) === s.difficulty) &&
      (!s.length || r.l === s.length) &&
      (!s.guide || (s.guide === 'yes' ? r.hg === 1 : r.hg === 0)),
    );
    if (hits) list = list.filter((r) => hits.has(r.s));
    const cmp: Record<Sort, (a: CatalogRow, b: CatalogRow) => number> = {
      assigned: (a, b) => b.pc - a.pc || a.y - b.y,
      chronological: (a, b) => a.y - b.y,
      title: (a, b) => a.t.localeCompare(b.t),
      author: (a, b) => a.as.localeCompare(b.as) || a.y - b.y,
      difficulty: (a, b) => a.d - b.d || b.pc - a.pc,
    };
    if (hits && s.sort === 'assigned') list.sort((a, b) => hits.get(a.s)! - hits.get(b.s)!);
    else list.sort(cmp[s.sort]);
    return list;
  }, [rows, s, hits]);

  // apply to DOM + URL
  useEffect(() => {
    const grid = document.getElementById('browse-grid'); if (!grid) return;
    const cards = new Map<string, HTMLElement>();
    grid.querySelectorAll<HTMLElement>('.card[data-slug]').forEach((c) => cards.set(c.dataset.slug!, c));
    const show = new Set(visible.map((r) => r.s));
    cards.forEach((c, slug) => { c.hidden = !show.has(slug); c.style.removeProperty('--i'); });
    visible.forEach((r, i) => { const c = cards.get(r.s); if (c) { grid.appendChild(c); if (i < 12) c.style.setProperty('--i', String(i)); } });
    const empty = document.getElementById('browse-empty'); if (empty) empty.hidden = visible.length > 0;
    if (first.current) { first.current = false; return; }
    history.replaceState(null, '', toUrl(s));
  }, [visible]);

  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const program = facets.programs.find((p) => p.id === s.program);
  const label = (list: Facet[], id: string) => list.find((x) => x.id === id)?.label ?? id;

  // Every active filter, as one removable list. This is the only place that reports state.
  const pills: { key: string; label: string; clear: () => void }[] = [];
  if (s.guide) pills.push({ key: 'guide', label: s.guide === 'yes' ? 'Has a reading guide' : 'Catalogue entry only', clear: () => set({ guide: '' }) });
  if (s.program) pills.push({ key: 'program', label: label(facets.programs, s.program) + (s.segment && program ? `, ${label(program.segments, s.segment)}` : ''), clear: () => set({ program: '', segment: '' }) });
  s.theme.forEach((t) => pills.push({ key: `theme-${t}`, label: label(facets.themes, t), clear: () => set({ theme: s.theme.filter((x) => x !== t) }) }));
  if (s.genre) pills.push({ key: 'genre', label: label(facets.genres, s.genre), clear: () => set({ genre: '' }) });
  if (s.era) pills.push({ key: 'era', label: label(facets.eras, s.era), clear: () => set({ era: '' }) });
  if (s.author) pills.push({ key: 'author', label: label(facets.authors, s.author), clear: () => set({ author: '' }) });
  if (s.difficulty) pills.push({ key: 'difficulty', label: DIFFICULTY[Number(s.difficulty) - 1], clear: () => set({ difficulty: '' }) });
  if (s.length) pills.push({ key: 'length', label: label(LENGTH, s.length), clear: () => set({ length: '' }) });
  if (s.region) pills.push({ key: 'region', label: label(facets.regions, s.region), clear: () => set({ region: '' }) });
  if (s.language) pills.push({ key: 'language', label: label(facets.languages, s.language), clear: () => set({ language: '' }) });

  // Counts on every facet, computed against the other active filters, so a zero-result
  // combination is visible before it is chosen rather than apologised for afterwards.
  const countIf = (pred: (r: CatalogRow) => boolean) => {
    let n = 0;
    for (const r of rows) {
      if (!pred(r)) continue;
      if (s.program && !r.p.includes(s.program)) continue;
      if (s.era && r.e !== s.era) continue;
      if (s.genre && !r.g.includes(s.genre)) continue;
      if (s.guide && (s.guide === 'yes' ? r.hg !== 1 : r.hg !== 0)) continue;
      n++;
    }
    return n;
  };
  const guidedTotal = rows.reduce((n, r) => n + r.hg, 0);
  const themesShown = showAllThemes ? facets.themes : facets.themes.slice(0, 8);

  const Select = ({ label: lbl, k, opts, all }: { label: string; k: keyof State; opts: Facet[]; all: string }) => (
    <p class="f">
      <label class="f__label" for={`f-${k}`}>{lbl}</label>
      <select id={`f-${k}`} value={s[k] as string} onChange={(e) => set({ [k]: (e.target as HTMLSelectElement).value } as any)}>
        <option value="">{all}</option>
        {opts.map((o) => <option value={o.id}>{o.label}</option>)}
      </select>
    </p>
  );

  return (
    <>
      {/* Search leads: it is the fastest way into 689 works. Sort sits with the count,
          and the filters come after both. */}
      <div class="browse-search">
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" stroke-linecap="round" /></svg>
        <input id="browse-q" type="search" value={s.q} placeholder="Search titles, authors, summaries…" aria-label="Search inside every book" onInput={(e) => set({ q: (e.target as HTMLInputElement).value })} />
        {s.q && <button type="button" class="browse-search__clear" onClick={() => set({ q: '' })} aria-label="Clear search">×</button>}
      </div>

      {/* Results bar: count, active filters and sort, pinned directly above the grid.
          Filtering 689 cards with the only readout off-screen reads as a broken control. */}
      <div class="resultbar" role="status" aria-live="polite">
        <p class="resultbar__count">
          <strong>{visible.length}</strong> {visible.length === 1 ? 'book' : 'books'}
          {visible.length !== total && <span class="resultbar__of"> of {total}</span>}
          {searching && <span class="resultbar__spin" aria-hidden="true" />}
        </p>
        {pills.length > 0 && (
          <ul class="resultbar__pills">
            {pills.map((p) => (
              <li key={p.key}>
                <button type="button" class="pill" onClick={p.clear}>
                  {p.label}<span class="pill__x" aria-hidden="true">×</span>
                  <span class="visually-hidden">, remove this filter</span>
                </button>
              </li>
            ))}
            <li><button type="button" class="resultbar__clear" onClick={() => set({ ...EMPTY, q: s.q, sort: s.sort })}>Clear all</button></li>
          </ul>
        )}
        <p class="f f--sort resultbar__sort">
          <label class="f__label" for="f-sort">Sort</label>
          <select id="f-sort" value={s.sort} onChange={(e) => set({ sort: (e.target as HTMLSelectElement).value as Sort })}>
            <option value="assigned">Most assigned</option>
            <option value="chronological">Chronological</option>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="difficulty">Easiest first</option>
          </select>
        </p>
      </div>

      <div class="filters">
        <button class="filters__toggle" type="button" aria-expanded={open} aria-controls="filters-body" onClick={() => setOpen(!open)}>
          <span>Filters{pills.length ? ` (${pills.length})` : ''}</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        <div class={`filters__body${open ? ' is-open' : ''}`} id="filters-body">
          <p class="f">
            <label class="f__label" for="f-guide">Reading guide</label>
            <select id="f-guide" value={s.guide} onChange={(e) => set({ guide: (e.target as HTMLSelectElement).value })}>
              <option value="">Any ({rows.length})</option>
              <option value="yes">Written ({guidedTotal})</option>
              <option value="no">Catalogue only ({rows.length - guidedTotal})</option>
            </select>
          </p>
          <p class="f">
            <label class="f__label" for="f-program">Program</label>
            <select id="f-program" value={s.program} onChange={(e) => set({ program: (e.target as HTMLSelectElement).value, segment: '' })}>
              <option value="">All programs</option>
              {facets.programs.map((p) => <option value={p.id}>{p.label} ({countIf((r) => r.p.includes(p.id))})</option>)}
            </select>
          </p>
          {program && program.segments.length > 1 && (
            <div class="f">
              <span class="f__label">Within {program.label}</span>
              <div class="segs">
                <button type="button" class={`seg${!s.segment ? ' on' : ''}`} aria-pressed={!s.segment} onClick={() => set({ segment: '' })}>All</button>
                {program.segments.map((sg) => <button type="button" class={`seg${s.segment === sg.id ? ' on' : ''}`} aria-pressed={s.segment === sg.id} onClick={() => set({ segment: sg.id })}>{sg.label}</button>)}
              </div>
            </div>
          )}
          <div class="f">
            <span class="f__label">Themes</span>
            <div class="chips">
              {themesShown.map((t) => {
                const on = s.theme.includes(t.id);
                const n = countIf((r) => r.th.includes(t.id));
                return (
                  <button type="button" class={`chip${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && n === 0}
                    onClick={() => set({ theme: on ? s.theme.filter((x) => x !== t.id) : [...s.theme, t.id] })}>
                    {t.label} <span class="chip__n">{n}</span>
                  </button>
                );
              })}
            </div>
            {facets.themes.length > 8 && (
              <button type="button" class="f__more" aria-expanded={showAllThemes} onClick={() => setShowAllThemes(!showAllThemes)}>
                {showAllThemes ? 'Fewer themes' : `All ${facets.themes.length} themes`}
              </button>
            )}
          </div>
          <Select label="Form" k="genre" opts={facets.genres} all="Any form" />
          <Select label="Era" k="era" opts={facets.eras} all="Any era" />
          <Select label="Author" k="author" opts={facets.authors} all="Any author" />
          <p class="f">
            <label class="f__label" for="f-difficulty">Difficulty</label>
            <select id="f-difficulty" value={s.difficulty} onChange={(e) => set({ difficulty: (e.target as HTMLSelectElement).value })}>
              <option value="">Any difficulty</option>
              {DIFFICULTY.map((d, i) => <option value={String(i + 1)}>{d}</option>)}
            </select>
          </p>
          <Select label="Length" k="length" opts={LENGTH} all="Any length" />
          <details class="more">
            <summary>Region and language</summary>
            <Select label="Region" k="region" opts={facets.regions} all="Anywhere" />
            <Select label="Original language" k="language" opts={facets.languages} all="Any language" />
          </details>
          <button type="button" class="filters__done" onClick={() => { setOpen(false); document.getElementById('browse-grid')?.scrollIntoView({ block: 'start' }); }}>
            Show {visible.length} {visible.length === 1 ? 'book' : 'books'}
          </button>
        </div>
      </div>
      <style>{`
        .resultbar {
          grid-area: bar; position: sticky; top: var(--header-h); z-index: 10;
          display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s0) var(--s1);
          padding: var(--s0) 0; margin-bottom: var(--s1);
          background: color-mix(in oklch, var(--paper) 92%, transparent);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid var(--paper-deeper);
        }
        .resultbar__count { font-family: var(--font-ui); font-size: var(--step--1); color: var(--ink-soft); display: flex; align-items: baseline; gap: 0.4rem; }
        .resultbar__count strong { font-family: var(--font-display); font-size: var(--step-1); font-weight: 500; color: var(--ink-strong); font-variant-numeric: tabular-nums; }
        .resultbar__of { color: var(--ink-mute); }
        .resultbar__spin { width: 9px; height: 9px; border: 2px solid var(--paper-deeper); border-top-color: var(--accent); border-radius: 50%; animation: rbspin 0.8s linear infinite; }
        @keyframes rbspin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .resultbar__spin { animation: none; border-top-color: var(--paper-deeper); } }
        .resultbar__pills { list-style: none; display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0; padding: 0; min-width: 0; }
        .pill {
          display: inline-flex; align-items: center; gap: 0.4em;
          font-family: var(--font-ui); font-size: var(--step--2); line-height: 1;
          padding: 0.5em 0.7em; border-radius: 999px; min-height: 30px;
          background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
          transition: background var(--dur-fast);
        }
        .pill:hover { background: var(--accent); border-color: var(--accent); }
        .pill__x { font-size: 1.15em; line-height: 0; opacity: 0.8; }
        .resultbar__clear { font-family: var(--font-ui); font-size: var(--step--2); color: var(--accent); text-decoration: underline; text-underline-offset: 0.2em; min-height: 30px; padding: 0 0.2em; }
        .resultbar .f--sort { margin-left: auto; display: flex; align-items: baseline; gap: 0.5rem; width: auto; }
        .resultbar .f--sort .f__label { margin: 0; white-space: nowrap; }
        .resultbar .f--sort select { width: auto; min-width: 9.5rem; padding-block: 0.35rem; min-height: 44px; }

        .filters { grid-area: rail; display: grid; gap: var(--s2); align-content: start;
          position: sticky; top: calc(var(--header-h) + 3.5rem);
          /* A sticky panel taller than the viewport pins its own lower half out of reach. */
          max-height: calc(100dvh - var(--header-h) - 3.75rem); overflow-y: auto; overscroll-behavior: contain;
          padding-right: 2px; scrollbar-gutter: stable; min-width: 0;
        }
        .browse-search {
          grid-area: search; display: flex; align-items: center; gap: var(--s0); min-width: 0;
          border-bottom: 1px solid var(--ink); padding: 0.45rem 0; color: var(--ink-soft);
        }
        .browse-search input {
          flex: 1; min-width: 0; font-family: var(--font-display); font-size: var(--step-1);
          background: none; border: 0; color: var(--ink-strong); min-height: 44px;
        }
        .browse-search input:focus-visible { outline-offset: 1px; }
        .browse-search input::placeholder { color: var(--ink-mute); font-style: italic; }
        .browse-search input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
        .browse-search__clear { font-size: var(--step-1); line-height: 1; color: var(--ink-mute); min-width: 44px; min-height: 44px; }
        .browse-search__clear:hover { color: var(--accent); }
        .filters__toggle { display: none; width: 100%; justify-content: space-between; align-items: center; gap: var(--s1);
          font-family: var(--font-ui); font-size: var(--step--1); font-weight: 700; min-height: 46px;
          padding: 0.6rem 0; border-bottom: 1px solid var(--paper-deeper); }
        .filters__body { display: grid; gap: var(--s2); min-width: 0; }
        .f { display: grid; gap: 0.3rem; margin: 0; min-width: 0; }
        .f__label { font-family: var(--font-ui); font-size: var(--step--2); font-weight: 500; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-mute); }
        .f select {
          font-family: var(--font-ui); font-size: var(--step--1); color: var(--ink-strong);
          background-color: transparent; border: 0; border-bottom: 1px solid var(--paper-deeper);
          padding: 0.55rem 1.4rem 0.55rem 0; min-height: 44px; width: 100%; max-width: 100%;
          border-radius: 0; -webkit-appearance: none; appearance: none; cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
          background-position: calc(100% - 11px) 55%, calc(100% - 6px) 55%;
          background-size: 5px 5px; background-repeat: no-repeat;
        }
        .f select:hover { border-bottom-color: var(--ink-mute); }
        .chips, .segs { display: flex; flex-wrap: wrap; gap: 0.35rem; min-width: 0; }
        .chip, .seg {
          display: inline-flex; align-items: center; gap: 0.4em; max-width: 100%;
          font-family: var(--font-ui); font-size: var(--step--2); line-height: 1;
          padding: 0.6em 0.75em; min-height: 36px; border-radius: 999px;
          border: 1px solid var(--paper-deeper); color: var(--ink-soft);
          transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast);
        }
        .chip:hover:not(:disabled), .seg:hover { border-color: var(--ink-mute); color: var(--ink-strong); }
        .chip.on, .seg.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }
        .chip:disabled { opacity: 0.4; cursor: not-allowed; }
        .chip__n { font-size: 0.85em; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
        .chip.on .chip__n { color: color-mix(in oklch, var(--paper) 70%, transparent); }
        .f__more, .more > summary {
          display: flex; align-items: center;
          font-family: var(--font-ui); font-size: var(--step--2); color: var(--ink-soft);
          justify-self: start; min-height: 44px; text-decoration: underline; text-underline-offset: 0.2em; cursor: pointer;
        }
        .more > summary { list-style: none; text-decoration: none; }
        .more > summary::-webkit-details-marker { display: none; }
        .more > summary::before { content: '+ '; }
        .more[open] > summary::before { content: '− '; }
        .more > .f { margin-top: var(--s1); }
        .filters__done { display: none; }

        @media (max-width: 860px) {
          .filters { position: static; max-height: none; overflow: visible; }
          .resultbar { top: var(--header-h); }
          .filters__toggle { display: flex; }
          .filters__body { display: none; }
          .filters__body.is-open { display: grid; padding-bottom: var(--s1); }
          /* A filter sheet with no way out and no count is a trap. */
          .filters__done {
            display: block; position: sticky; bottom: 0; z-index: 2;
            font-family: var(--font-ui); font-size: var(--step--1); font-weight: 700;
            min-height: 48px; width: 100%; margin-top: var(--s1);
            background: var(--ink); color: var(--paper); border-radius: 3px;
          }
          .resultbar {
            display: grid; grid-template-columns: auto 1fr;
            grid-template-areas: 'count sort' 'pills pills';
            align-items: baseline; column-gap: var(--s1); row-gap: var(--s0);
          }
          .resultbar__count { grid-area: count; }
          .resultbar .f--sort { grid-area: sort; justify-self: end; margin-left: 0; }
          .resultbar__pills { grid-area: pills; }
        }
      `}</style>
    </>
  );
}
