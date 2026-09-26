# Search plan: from book index to study tool

Three phases, each shippable on its own, each built on the one before. The rule that
shaped this document: nothing in Phase 1 is thrown away or rewritten in Phase 2 or 3.
The overlap table at the end lists every place a later phase touches Phase 1 work and
says how the Phase 1 version is built so it survives.

## Where search stands today

- Pagefind (via `astro-pagefind`) indexes book, author, program, about, privacy and
  disclosure pages. Theme, era and genre pages are not indexed.
- Book pages index the guide body, synopsis, key themes, highlights, plus a hidden span
  of aliases, keywords and original title at weight 0.4. The 3D book's cover text is
  also indexed by accident (the stage has no `data-pagefind-ignore`).
- The facts block (era, form, language, length, difficulty) is excluded from the index,
  so "hard", "epic", "Greek tragedy" and "medieval" do not match on those fields.
- Metadata per hit: `type`, `author`, `slug`, `cover`, `tone`, `title`. No filters
  beyond `type`.
- Two consumers, two loaders: `SearchPalette.astro` (8 hits, 18-word excerpts, flat
  list) and `Browse.tsx` (200 hits used only to order and hide cards). Each imports
  `/pagefind/pagefind.js` on its own.
- The `aliases` field is filled on 604 of 689 works, empty on 56, missing on 29.
- Analytics: one `search_used` event per session carrying only the query length.

## Phase 1: quick wins (one PR, one to two days)

Everything here is Pagefind config, metadata and result rendering. No new
infrastructure, no per-query cost.

### 1a. Index the right things

| Change | File | Why |
|---|---|---|
| Add `data-pagefind-ignore` to `.work__stage` | `src/pages/books/[slug].astro` | Cover and spine text pollute excerpts |
| Emit `data-pagefind-filter` for `era`, `genre`, `language`, `length`, `difficulty`, `program`, `theme` | same | Structured queries and grouped results |
| Emit `data-pagefind-meta` for `year`, `difficulty`, `length`, `pages`, `era`, `genre`, `themes` (comma list), `guide` (yes/no), `lists` (count) | same | Hits can show the answer without a click |
| Hidden span of era, genre, length and difficulty *words* (for example "hard", "epic", "Greek") at weight 0.6 | same | Word search matches the facts, not just the filter |
| Add `data-pagefind-body`, type meta and filter to theme, era and genre pages | `src/pages/themes/[slug].astro`, `eras/`, `genres/` | Concept queries should land on the theme page |
| Give `h1` title `data-pagefind-weight="10"` and author line weight 7 | book and author pages | Title and author outrank body mentions |
| Raise alias span to weight 1 and split keywords (weight 0.6) from aliases (weight 3) | `src/pages/books/[slug].astro` | "Iliad" finds the Iliad first |
| Segment labels and program short names in a hidden span on each book page | same | "sophomore", "St. John's" match books |

### 1b. Content fill

- Fill `aliases` on the 85 works that have none or an empty list. Same pipeline as the
  guides. Include translated titles, common short forms and transliterations.
- Add a short `aliases` list to authors missing one (Latin names, anglicised names).
- Run `npm run validate:content` after; extend it to warn on an empty aliases list.

### 1c. One search module, two consumers

Create `src/lib/search.ts`, a plain TypeScript module with no framework dependency:

```ts
export type Hit = { url; title; type; author?; excerpt; meta: Record<string,string>; filters? };
export async function loadSearch(): Promise<Engine | null>   // single cached import, options set once
export async function search(q: string, opts?: { filters?; limit?; excerptLength? }): Promise<Hit[]>
export function groupHits(hits: Hit[]): { books: Hit[]; authors: Hit[]; themes: Hit[]; programs: Hit[]; pages: Hit[] }
export function suggestFor(q: string, authors: string[], themes: string[]): string[]   // empty-state help
```

Both `SearchPalette.astro` and `Browse.tsx` import it. This is the single most important
overlap guard: every later phase adds a *second backend* behind the same `search()`
signature rather than editing either consumer again.

### 1d. Result design in the palette

- Excerpt length 32 words, matched terms bolded via Pagefind's `<mark>`.
- Results grouped with small caps headers: Books, Authors, Themes, Programs, Pages.
  Books capped at 6, others at 3, keyboard order follows the DOM.
- Each book hit shows cover, title, author and year, then a facts line: difficulty as
  dots, length word, one or two theme chips, "guide" badge when one exists.
- Empty state lists up to three nearest author names (prefix and fuzzy match on the
  author list shipped inline, it is 8KB) and links to the themes index.
- Hint row rotates through query types: a concept, an author, a program year, a
  difficulty phrase, so the palette teaches what it can answer.
- `Enter` on an empty selection with a query goes to `/books/?q=…`, which the Browse
  island already reads.

### 1e. Browse page

- Browse's text search calls the shared `search()` with `filters` derived from the active
  facet state, so the Pagefind filters and the facet filters agree.
- Query typed in the palette and sent to `/books/?q=` shows the same ranking.

### 1f. Measure

- Extend the `search_used` event with the group the user clicked (book, author, theme,
  program, none) and whether the result was in the top three. Still no query text.
- Add a `search_empty` event with the query length only.

Ships when: `npm run build` passes, Pagefind index size noted in the PR, a Playwright
script in the scratchpad checks ten sample queries return the expected first hit.

## Phase 2: the text layer (two to three PRs)

Goal: "find the passage" works on the roughly 400 works whose originals or older
translations are public domain.

### 2a. Texts as a content collection

- New collection `texts` with one entry per work that has a public domain source:
  `work` (slug), `source` (Standard Ebooks or Gutenberg URL), `translator`, `year`,
  `licence`, and the text split into `sections` with a stable id, heading and body.
- A fetch script `scripts/fetch-texts.ts` mirrors the source, normalises to Markdown,
  splits by the source's own headings (book, canto, act and scene, chapter). Cached
  under `.cache/texts/`. This needs `standardebooks.org` and `gutenberg.org` allowed
  in the environment network settings.
- Pages at `/books/{slug}/text/{section}/` rendered from the collection, with the
  work's guide linked in the side rail. Not in the sitemap until the design is reviewed.

### 2b. Index the texts

- Text pages carry `data-pagefind-body`, `data-pagefind-filter="type:Passage"`, and
  meta `work`, `section`, `heading`, `translator`.
- The index will grow a lot. Pagefind supports multiple indexes: build the passages
  into a second index at `/pagefind-text/` so the palette's first open still loads
  only the 9MB guide index. The shared `search()` module gains a `scope: 'guides' |
  'text' | 'all'` option and merges the two result sets.
- Palette gets a sixth group, Passages, shown only when the query matches nothing in
  Books or Themes, or when the user toggles "in the text". Book pages get a
  "Search inside" box scoped to that work via the `work` filter.

### 2c. Result design for passages

Reuses the Phase 1 hit component. A passage hit shows: work title and author in the
type line, the heading (Book 9, Act 3 Scene 1), the excerpt at 40 words, and a
"Read in context" link to the section page with the match highlighted by
`:target-text` where supported.

## Phase 3: answers (one PR plus a Worker)

### 3a. Embeddings, one time

- Chunk guide text and passage sections at about 300 words with 40 overlap. Embed with
  Voyage AI (`voyage-3.5-lite` or current equivalent), one batch job, under a dollar.
- Store as a static `embeddings.bin` plus `chunks.json` under `/ask/`. Lazy loaded only
  when the user opens the Ask mode. Cosine search in a Web Worker.
- Query embedding needs an API call, so this runs through the same Cloudflare Worker
  as 3b, or a minimal `/api/embed` route on it.

### 3b. Cited answers

- Cloudflare Worker at `/api/ask`: rate limited by IP, takes `{ question, scope }`,
  retrieves the top 8 chunks, calls Claude with a cached system prompt that requires
  citations to chunk ids, streams the answer back.
- Model: `claude-sonnet-5` by default, about a cent a question with caching. Switch
  to `claude-opus-5` for the comparative theme questions if quality is not there.
- Palette gets an "Ask" tab. Answers render as prose with inline superscript links to
  the book page or passage page, and the source hits listed beneath using the Phase 1
  hit component.

### 3c. Guard rails

- Only site text and public domain passages are in the retrieval set. The prompt says
  so and the UI says so.
- Log the question length, the scope and whether any citation was clicked. No question
  text.

## Overlap map: what each later phase touches, and how Phase 1 avoids rework

| Phase 1 work | Touched again in | How Phase 1 is built so it survives |
|---|---|---|
| `src/lib/search.ts` | 2b, 3a, 3b | Phase 1 defines the `Hit` type and the `search()` signature with `filters`, `scope` reserved as an optional field from day one. Phase 2 adds the text index behind it, Phase 3 adds a `mode: 'ask'` branch. Consumers never change again. |
| Hit rendering in the palette | 2c, 3b | Phase 1 renders a hit from the `Hit` type through one function, `renderHit(hit)`, with the type line, facts line and excerpt driven by `meta`. Passage hits and answer sources are just hits with different meta. |
| Result groups | 2b, 3b | `groupHits()` groups by `type` meta generically. Adding "Passage" is a new key and a header string, not a rewrite. |
| Book page metadata and filters | 2a | Text pages emit the *same* `work` slug meta the book page emits, so scoped "search inside" needs no new key. |
| Pagefind options | 2b | Phase 1 sets options in one place (the shared loader). The second index is a second `loadSearch(index)` call, not a second options block. |
| Alias fill | 2a, 3a | Aliases live in front matter. The fetch script matches Standard Ebooks titles against `aliases` and `originalTitle`, so filling them now makes Phase 2 matching better, not redundant. |
| Analytics events | 2, 3 | Event names are `search_used`, `search_empty` and a `group` field. Passages and Ask are new `group` values, not new events. |
| Browse filter to Pagefind filter mapping | 2b | Written as a pure function `facetsToFilters(state)` in `search.ts`, reused by the passage scope. |
| Theme pages indexed | 3b | Theme pages become the best retrieval chunks for concept questions. Indexing them now and writing them well pays twice. |

Things Phase 1 deliberately does **not** do, because Phase 2 or 3 would undo them:

- No fuzzy or stemming layer bolted onto Pagefind results in the palette. Phase 3's
  embeddings solve that properly. Phase 1 handles typos only in the empty-state author
  suggestions.
- No separate search page. The palette plus `/books/?q=` cover it, and a full page
  would be rebuilt when Ask arrives.
- No caching of Pagefind results in `localStorage`. The second index in Phase 2 would
  invalidate it.
- No client-side synonym table. Synonyms go into `aliases` front matter, which every
  phase reads.

## Order of work

1. Phase 1a and 1c together (index changes and the shared module), since the palette
   cannot show facts until the meta exists. One PR.
2. Phase 1b content fill and 1d, 1e, 1f in the same PR or a second one the same day.
3. Environment: allow `standardebooks.org` and `gutenberg.org`, then Phase 2a fetch
   script and collection. PR with texts for a first batch of about 40 works so the
   design can be reviewed on real pages.
4. Phase 2b and 2c, then the remaining texts in batches of 100 so PR size stays sane.
5. Phase 3 once search analytics show what people ask. Worker, embeddings job, Ask tab.

## Open decisions for the owner

- Which translations to mirror where more than one is public domain (for example
  Butler versus Lang for Homer). Default: Standard Ebooks' choice.
- Whether text pages should be indexed by Google. Default: no until they are reviewed,
  since thin duplicate pages of Gutenberg text can hurt the site's ranking.
- Phase 3 model and monthly cap on the Worker.
