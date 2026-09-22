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
  author: string; difficulty: string; length: string; sort: Sort;
}
const EMPTY: State = { q: '', program: '', segment: '', theme: [], genre: '', era: '', region: '', language: '', author: '', difficulty: '', length: '', sort: 'assigned' };

function fromUrl(): State {
  if (typeof location === 'undefined') return EMPTY;
  const p = new URLSearchParams(location.search);
  return {
    ...EMPTY,
    q: p.get('q') ?? '', program: p.get('program') ?? '', segment: p.get('segment') ?? '',
    theme: p.getAll('theme'), genre: p.get('genre') ?? '', era: p.get('era') ?? '', region: p.get('region') ?? '',
    language: p.get('language') ?? '', author: p.get('author') ?? '', difficulty: p.get('difficulty') ?? '', length: p.get('length') ?? '',
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
      (!s.length || r.l === s.length),
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
    // reorder
    visible.forEach((r, i) => { const c = cards.get(r.s); if (c) { grid.appendChild(c); if (i < 12) c.style.setProperty('--i', String(i)); } });
    const empty = document.getElementById('browse-empty'); if (empty) empty.hidden = visible.length > 0;
    const count = document.getElementById('browse-count'); if (count) count.textContent = String(visible.length);
    if (first.current) { first.current = false; return; }
    history.replaceState(null, '', toUrl(s));
  }, [visible]);

  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const program = facets.programs.find((p) => p.id === s.program);
  const active = Object.entries(s).filter(([k, v]) => k !== 'sort' && k !== 'q' && (Array.isArray(v) ? v.length : v)).length;
  const countFor = (key: keyof CatalogRow, id: string, arr = false) => rows.filter((r) => arr ? (r[key] as string[]).includes(id) : String(r[key]) === id).length;

  const Select = ({ label, k, opts, all = 'Any' }: { label: string; k: keyof State; opts: Facet[]; all?: string }) => (
    <label class="f">
      <span class="f__label">{label}</span>
      <select value={s[k] as string} onChange={(e) => set({ [k]: (e.target as HTMLSelectElement).value } as any)}>
        <option value="">{all}</option>
        {opts.map((o) => <option value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );

  return (
    <div class="filters">
      <div class="filters__search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" stroke-linecap="round" /></svg>
        <input type="search" value={s.q} placeholder="Search titles, authors, summaries…" aria-label="Search books" onInput={(e) => set({ q: (e.target as HTMLInputElement).value })} />
        {searching && <span class="filters__spin" aria-hidden="true" />}
      </div>
      <button class="filters__toggle ui" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Filters{active ? ` (${active})` : ''} <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div class={`filters__body${open ? ' is-open' : ''}`}>
        <label class="f">
          <span class="f__label">Program</span>
          <select value={s.program} onChange={(e) => set({ program: (e.target as HTMLSelectElement).value, segment: '' })}>
            <option value="">All programs</option>
            {facets.programs.map((p) => <option value={p.id}>{p.label} ({countFor('p', p.id, true)})</option>)}
          </select>
        </label>
        {program && program.segments.length > 1 && (
          <div class="f">
            <span class="f__label">Within {program.label}</span>
            <div class="segs">
              <button type="button" class={`seg${!s.segment ? ' on' : ''}`} onClick={() => set({ segment: '' })}>All</button>
              {program.segments.map((sg) => <button type="button" class={`seg${s.segment === sg.id ? ' on' : ''}`} onClick={() => set({ segment: sg.id })}>{sg.label}</button>)}
            </div>
          </div>
        )}
        <div class="f">
          <span class="f__label">Themes</span>
          <div class="chips">
            {facets.themes.map((t) => {
              const on = s.theme.includes(t.id);
              return <button type="button" class={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ theme: on ? s.theme.filter((x) => x !== t.id) : [...s.theme, t.id] })}>{t.label}</button>;
            })}
          </div>
        </div>
        <Select label="Form" k="genre" opts={facets.genres} all="Any form" />
        <Select label="Era" k="era" opts={facets.eras} all="Any era" />
        <Select label="Author" k="author" opts={facets.authors} all="Any author" />
        <div class="f f--row">
          <label class="f">
            <span class="f__label">Difficulty</span>
            <select value={s.difficulty} onChange={(e) => set({ difficulty: (e.target as HTMLSelectElement).value })}>
              <option value="">Any</option>
              {['1', '2', '3', '4', '5'].map((d, i) => <option value={d}>{['Approachable', 'Moderate', 'Demanding', 'Difficult', 'Formidable'][i]}</option>)}
            </select>
          </label>
          <label class="f">
            <span class="f__label">Length</span>
            <select value={s.length} onChange={(e) => set({ length: (e.target as HTMLSelectElement).value })}>
              <option value="">Any</option>
              <option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option><option value="epic">Epic</option>
            </select>
          </label>
        </div>
        <details class="more">
          <summary class="ui">More</summary>
          <Select label="Region" k="region" opts={facets.regions} all="Anywhere" />
          <Select label="Original language" k="language" opts={facets.languages} all="Any language" />
        </details>
        {active > 0 && <button type="button" class="filters__clear ui" onClick={() => set({ ...EMPTY, q: s.q, sort: s.sort })}>Clear filters</button>}
      </div>
      <label class="f f--sort">
        <span class="f__label">Sort</span>
        <select value={s.sort} onChange={(e) => set({ sort: (e.target as HTMLSelectElement).value as Sort })}>
          <option value="assigned">Most assigned</option>
          <option value="chronological">Chronological</option>
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="difficulty">Easiest first</option>
        </select>
      </label>
      <p class="filters__count ui">{visible.length} of {total}</p>
      <style>{`
        .filters { display: grid; gap: var(--s2); position: sticky; top: 4.75rem; }
        .filters__search { display: flex; align-items: center; gap: 0.6rem; border-bottom: 1px solid var(--ink); padding: 0.4rem 0; color: var(--ink-soft); }
        .filters__search input { flex: 1; min-width: 0; font-family: var(--font-display); font-size: var(--step-0); background: none; border: 0; outline: 0; color: var(--ink-strong); }
        .filters__search input::placeholder { color: var(--ink-mute); font-style: italic; }
        .filters__spin { width: 10px; height: 10px; border: 2px solid var(--paper-deeper); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .filters__toggle { display: none; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid var(--paper-deeper); }
        .filters__body { display: grid; gap: var(--s2); }
        .f { display: grid; gap: 0.35rem; }
        .f--row { grid-template-columns: 1fr 1fr; gap: var(--s1); }
        .f__label { font-family: var(--font-ui); font-size: var(--step--2); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-mute); }
        .f select { font-family: var(--font-ui); font-size: var(--step--1); color: var(--ink-strong); background: transparent; border: 0; border-bottom: 1px solid var(--paper-deeper); padding: 0.4rem 0; border-radius: 0; -webkit-appearance: none; appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--ink-mute) 50%), linear-gradient(135deg, var(--ink-mute) 50%, transparent 50%); background-position: calc(100% - 12px) 55%, calc(100% - 7px) 55%; background-size: 5px 5px; background-repeat: no-repeat; cursor: pointer; }
        .f select:focus { outline: none; border-bottom-color: var(--accent); }
        .chips, .segs { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .chip, .seg { font-family: var(--font-ui); font-size: var(--step--2); padding: 0.3em 0.65em; border-radius: 999px; border: 1px solid var(--paper-deeper); color: var(--ink-soft); transition: all var(--dur-fast); }
        .chip:hover, .seg:hover { border-color: var(--ink-mute); color: var(--ink-strong); }
        .chip.on, .seg.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }
        .more summary { cursor: pointer; color: var(--ink-soft); list-style: none; }
        .more summary::before { content: '+ '; }
        .more[open] summary::before { content: '− '; }
        .more > .f { margin-top: var(--s1); }
        .filters__clear { justify-self: start; color: var(--accent-deep); text-decoration: underline; text-underline-offset: 0.15em; }
        .filters__count { color: var(--ink-mute); font-size: var(--step--2); }
        @media (max-width: 860px) {
          .filters { position: static; }
          .filters__toggle { display: flex; }
          .filters__body { display: none; }
          .filters__body.is-open { display: grid; }
        }
      `}</style>
    </div>
  );
}
