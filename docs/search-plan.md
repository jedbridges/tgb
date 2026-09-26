# Search plan: from book index to study tool

This is the living plan for search. It spans several sessions. Every session starts by
reading the **Status** section, does the next unchecked item, and ends by updating it
with the PR link. Nothing else in the repository tracks this work.

Two rules shape every phase:

1. **Nothing built in an earlier phase is thrown away or rewritten later.** The overlap
   map near the end lists every place a later phase touches earlier work and how the
   earlier version is built so it survives.
2. **Every search feature has a crawlable twin.** Search itself runs in the browser, so
   Google never sees a result list. Organic traffic comes from static pages that answer
   the same questions people type into the box. Each phase names the pages it adds to
   the sitemap and the internal links that point at them.

## Status

Update this section at the end of every session.

| Item | State | PR |
|---|---|---|
| Plan written, options reviewed | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1a Index the right things | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1b Alias fill on 85 works and authors | Not started | |
| 1c Shared search module | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1d Palette result design | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1e Browse uses the shared module and filters | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1f Analytics groups | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1g SEO: search landing pages and sitelinks | Not started | |
| 2a Texts collection and fetch script | Blocked on network allow list | |
| 2b Passage index | Not started | |
| 2c Passage result design and text pages | Not started | |
| 2d SEO for text pages | Not started | |
| 3a Cloudflare AI Search over R2 | Not started | |
| 3b Ask tab and cited answers | Not started | |
| 3c SEO: reviewed question pages | Not started | |

Environment asks still open: allow `standardebooks.org` and `gutenberg.org` for Phase 2;
allow `openlibrary.org`, `covers.openlibrary.org`, `archive.org` and store
`GOOGLE_BOOKS_API_KEY` for the covers job that predates this plan.

## Where search stood at the start

- Pagefind (via `astro-pagefind`) indexed book, author, program, about, privacy and
  disclosure pages. Theme, era and genre pages were not indexed.
- Book pages indexed the guide body, synopsis, key themes, highlights, plus a hidden span
  of aliases, keywords and original title at weight 0.4. The 3D book's cover text was
  also indexed by accident (the stage had no `data-pagefind-ignore`).
- The facts block (era, form, language, length, difficulty) was excluded from the index,
  so "hard", "epic", "Greek tragedy" and "medieval" did not match on those fields.
- Metadata per hit: `type`, `author`, `slug`, `cover`, `tone`, `title`. No filters
  beyond `type`.
- Two consumers, two loaders: `SearchPalette.astro` (8 hits, 18 word excerpts, flat
  list) and `Browse.tsx` (200 hits used only to order and hide cards).
- `aliases` filled on 604 of 689 works, empty on 56, missing on 29.
- Analytics: one `search_used` event per session carrying only the query length.
- SEO: WebSite JSON-LD with a SearchAction pointing at `/books/?q=` already existed.
  Theme, era and genre pages existed but were a card grid with a one line description.

## Phase 1: quick wins

Pagefind config, metadata, result rendering, and the crawlable pages that mirror what
search can answer. No new infrastructure, no per query cost.

### 1a. Index the right things

| Change | File | Why |
|---|---|---|
| `data-pagefind-ignore` on `.work__stage` | `src/pages/books/[slug].astro` | Cover and spine text polluted excerpts |
| `data-pagefind-filter` for `era`, `genre`, `language`, `length`, `difficulty`, `program`, `theme`, `guide` | same | Structured queries and grouped results |
| `data-pagefind-meta` for `year`, `difficulty`, `length`, `pages`, `era`, `genre`, `themes`, `guide`, `lists` | same | Hits show the answer without a click |
| Hidden span of the facts as words ("Demanding", "Epic", "Greek", "Ancient") at weight 0.6 | same | Word search matches the facts |
| Hidden span of program short names and segment labels at weight 0.6 | same | "sophomore" and "St. John's" match books |
| Title weight 10, author line weight 7 | book and author pages | Title and author outrank body mentions |
| Aliases and original title at weight 3, keywords at 0.6 | `src/pages/books/[slug].astro` | "Iliad" finds the Iliad first |
| `data-pagefind-body`, type meta and filter on theme, era and genre pages | `src/components/TaxonomyPage.astro` | Concept queries land on the theme page |

### 1b. Content fill

- Program short forms ("St Johns", "SJC", "Columbia Core") need somewhere to live: add an
  `aliases` field to the program schema and weight it like the book aliases. Today
  "St Johns" finds Samuel Johnson first.

- Fill `aliases` on the 85 works that have none or an empty list: translated titles,
  common short forms, transliterations.
- Add `aliases` to authors missing one (Latin names, anglicised names).
- Extend `npm run validate:content` to warn on an empty aliases list.

### 1c. One search module, two consumers

`src/lib/search.ts`, plain TypeScript, no framework dependency:

```ts
export type Hit = { url; title; type; author?; excerpt; meta: Record<string,string> };
export async function loadSearch(): Promise<Engine | null>   // one cached import, options set once
export async function search(q, opts?: { filters?; limit?; scope? }): Promise<Hit[]>
export function groupHits(hits): Record<Group, Hit[]>
export function suggestFor(q, names): string[]              // empty state help
export function facetsToFilters(state): Filters             // Browse facet state to Pagefind filters
```

Both `SearchPalette.astro` and `Browse.tsx` import it. Every later phase adds a second
backend behind the same `search()` rather than editing either consumer again.

### 1d. Result design in the palette

- Excerpts of 32 words with matched terms marked.
- Results grouped under small caps headers: Books, Authors, Themes, Programs, Pages.
  Books capped at 6, the others at 3. Keyboard order follows the DOM.
- Each book hit shows cover, title, author and year, then a facts line: difficulty word,
  length word, one or two theme chips, a "guide" mark when one exists. Chips are links
  to the theme pages, which is an internal link crawlers can also follow from the theme
  page grid.
- Empty state offers up to three nearest author names (prefix and fuzzy match on the
  author list shipped inline) and links to the themes index.
- Hint row rotates through query types: a concept, an author, a program year, a
  difficulty phrase.
- `Enter` with no selection goes to `/books/?q=…`.

### 1e. Browse page

- Browse's text search calls the shared `search()` with filters derived from the facet
  state so the two filter systems agree.

### 1f. Measure

- `search_used` gains a `group` field (book, author, theme, program, page, none) and
  `top3` (whether the click was in the first three). Still no query text.
- `search_empty` with query length only.

### 1g. SEO for Phase 1

The palette is invisible to crawlers. These pages are its crawlable twin.

- **Theme, era and genre pages become real pages.** Each gets a 150 to 300 word
  introduction that names the works and the questions they share, a "start here" pick,
  and a "read together" pairing. Titles stay "Great books about justice". These are the
  landing pages for the concept queries, which are the most searched kind.
- **Difficulty and length pages.** `/books/approachable/`, `/books/short/` and so on,
  static, with an introduction and the card grid, in the sitemap. They answer "easy
  great books", "short classics" and "hardest books on the list", which are real search
  queries with no good answer today.
- **Program year pages already exist** as segment anchors. Give each segment a short
  description so "St. John's sophomore reading list" matches a heading with text under
  it, and add ItemList JSON-LD per segment.
- **Sitelinks search box.** The WebSite SearchAction already points at `/books/?q=`.
  Add `<link rel="canonical">` on `/books/` so query URLs collapse to it.
- **Internal links from search hits.** Theme chips and the facts line in each hit link
  to the pages above. That is user value, not crawl value, but it puts the landing pages
  one click from every search.
- Sitemap: add the new difficulty and length pages, keep theme, era and genre pages.

## Phase 2: the text layer

"Find the passage" on the roughly 400 works whose originals or older translations are
public domain.

### 2a. Texts as a content collection

- New collection `texts`: `work`, `source`, `translator`, `year`, `licence`, and
  `sections` with a stable id, heading and body.
- `scripts/fetch-texts.ts` mirrors Standard Ebooks and Gutenberg, normalises to
  Markdown, splits on the source's own headings. Cached under `.cache/texts/`. Needs
  `standardebooks.org` and `gutenberg.org` allowed in the environment.

### 2b. Passage index

- Text pages carry `data-pagefind-body`, filter `type:Passage`, and meta `work`,
  `section`, `heading`, `translator`.
- Built as a second Pagefind index at `/pagefind-text/` so the palette's first open
  still loads only the guide index. The shared `search()` gains `scope: 'guides' |
  'text' | 'all'` and merges result sets.
- Palette adds a Passages group, shown when the query finds nothing in Books or Themes
  or when the user toggles "in the text". Book pages get a "Search inside" box scoped
  by the `work` filter.

### 2c. Passage result design and text pages

- Reuses the Phase 1 hit renderer. A passage hit shows work and author on the type
  line, the heading (Book 9, Act 3 Scene 1), a 40 word excerpt, and "Read in context".
- Text pages at `/books/{slug}/text/{section}/` with the guide's highlights and notes
  for that section shown beside the text, and the guide linked in the rail.

### 2d. SEO for text pages

Thin duplicate pages of Gutenberg text can hurt the whole site, so the text layer is
indexed carefully rather than wholesale.

- **Indexed:** section pages that carry site commentary (a highlight, a note, a key
  theme entry that cites the section). These are unique pages: the passage plus what it
  means plus where it sits on the reading lists.
- **noindex, follow:** section pages with bare text and no commentary. They still serve
  readers and pass links. Each one joins the index by itself when a note is added.
- **Canonical and attribution:** every text page names the source edition and links to
  it, which is what the licences ask and what keeps the pages honest.
- **Quote pages.** The highlights already in the guides become the seed for
  "famous passages from the Republic" pages, one per work with three or more highlights,
  with the text, the location, the translator, and a short note. These rank for
  quote queries, which are a large share of student searches.
- Sitemap: indexed section pages and quote pages only.

## Phase 3: answers

### 3a. Cloudflare AI Search over R2

- Sync the guide Markdown, theme pages and indexed passage sections to an R2 bucket at
  build time. Cloudflare AI Search (formerly AutoRAG) chunks, embeds and re-indexes.
  The vector store's free tier (5M stored, 30M queried dimensions a month, to be
  confirmed on the pricing page) covers this corpus.
- Route the answer model through AI Gateway to Claude (`claude-sonnet-5` by default,
  `claude-opus-5` if comparative questions need it).
- Fallback if chunking or citations are not good enough: a one time Voyage AI
  embedding job into a static file and a small Worker, as originally planned.

### 3b. Ask tab

- Palette gets an Ask tab. Answers render as prose with superscript links to the book
  or passage page, and the source hits listed beneath through the Phase 1 renderer.
- Only site text and public domain passages are in the retrieval set, and the UI says
  so.
- Log question length, scope and whether a citation was clicked. No question text.

### 3c. SEO for answers

Generated answers are never published automatically. Instead:

- Search analytics show which question shapes recur. The top ones are written up as
  reviewed question pages ("Which Plato dialogue should I read first?") with FAQPage
  JSON-LD, links to the works, and the Ask box embedded for follow ups.
- These pages are the crawlable twin of the Ask tab and the place organic traffic lands
  before discovering the tool.

## Off the shelf options considered

Checked in September 2026. Vendor docs were not reachable from the build container, so
the free tier numbers come from third party summaries and should be confirmed before
signing up.

| Option | Cost | What it gives | Verdict |
|---|---|---|---|
| Pagefind (current) | Free, static | Sharded index, filters, weights, metadata, no server | Keep. Nothing else does static keyword search this well at 689 pages plus texts. |
| Orama (open source) | Free, static | In browser hybrid keyword plus vector search | Whole index downloads before the first search; too heavy here. |
| Orama Cloud | Free tier, paid above | Hosted index, crawler, embeddable box with AI answers | Fastest path to an Ask demo. Vendor lock, styling limits, their model. Proof of concept only. |
| Cloudflare AI Search | Free tier on Vectorize, Workers AI billed | Managed chunking, embedding, retrieval and answers over R2, on the deploy platform | Best fit for Phase 3. |
| Meilisearch, Typesense | Free self hosted, cloud from about $30 a month | Server side hybrid search | Needs a server. Not for a static site this size. |
| Algolia DocSearch | Free for open source docs only | Hosted search | Not eligible. |
| MiniSearch, FlexSearch, Fuse | Free, static | Small in memory indexes | Right size for the author suggestions in the empty state. |

## Overlap map

| Earlier work | Touched again in | How it is built so it survives |
|---|---|---|
| `src/lib/search.ts` | 2b, 3a, 3b | `Hit`, `search()` with `filters` and an optional `scope` from day one. Phase 2 adds the text index behind it, Phase 3 an ask mode. Consumers never change again. |
| Hit rendering in the palette | 2c, 3b | One `renderHit(hit)` driven by `meta`. Passage hits and answer sources are hits with different meta. |
| Result groups | 2b, 3b | `groupHits()` keys on `type`. Passage is a new key and a header string. |
| Book page metadata and filters | 2a, 2d | Text pages emit the same `work` slug meta the book page emits. |
| Pagefind options | 2b | Set once in the shared loader. The second index is a second `load(index)` call. |
| Alias fill | 2a | Aliases live in front matter. The fetch script matches editions against `aliases` and `originalTitle`. |
| Analytics events | 2, 3 | `search_used` with a `group` field. Passage and Ask are new values. |
| `facetsToFilters()` | 2b | Pure function, reused by the passage scope. |
| `parseQuery()` in `search.ts` | 2b, 3b | Words that name a facet ("approachable Greek tragedy") become Pagefind filters and leave the text. Its vocabulary mirrors the taxonomies and is the same table the passage scope and the Ask prompt will use. The Phase 1 no-mark rule (a hit must mark a real fraction of a typed word) is what stops Pagefind's two letter fallback from filling the empty state. |
| Theme, era, genre pages written up (1g) | 3a, 3c | They become the best retrieval chunks for concept questions and the parents of the question pages. |
| Difficulty and length pages (1g) | 2d, 3c | Quote pages and question pages link into them; they never move. |
| Highlights in guides | 2c, 2d | Quote pages and section commentary are rendered from the same front matter, never copied. |

Phase 1 deliberately does **not** do these, because a later phase would undo them:

- No fuzzy or stemming layer bolted onto Pagefind results. Phase 3 solves that properly.
  Phase 1 handles typos only in the empty state author suggestions.
- No separate search page. The palette plus `/books/?q=` cover it.
- No caching of Pagefind results in `localStorage`. The second index would invalidate it.
- No client side synonym table. Synonyms go into `aliases` front matter.
- No generated answer pages. Question pages are written and reviewed (3c).

## Order of work

1. 1a, 1c, 1d, 1e, 1f in one PR. Then 1b and 1g, one PR each.
2. Environment: allow the two text hosts. 2a with a first batch of about 40 works so
   the page design can be reviewed on real text. Then 2b, 2c, 2d, and the rest of the
   texts in batches of 100.
3. Phase 3 once analytics show what people ask.

## Open decisions for the owner

- Which translations to mirror where more than one is public domain (for example
  Butler versus Lang for Homer). Default: Standard Ebooks' choice.
- Phase 3 model and a monthly cap on the Worker.
