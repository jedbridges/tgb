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
| 1b Alias fill on 85 works, 75 authors and 9 programs | Done | [#39](https://github.com/jedbridges/tgb/pull/39) |
| 1c Shared search module | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1d Palette result design | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1e Browse uses the shared module and filters | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1f Analytics groups | Done | [#38](https://github.com/jedbridges/tgb/pull/38) |
| 1h Header search bar cycles through example queries | Done | [#39](https://github.com/jedbridges/tgb/pull/39) |
| 1g SEO: shelf notes on 71 pages, difficulty and length pages, segment descriptions, per segment ItemList | Done | [#39](https://github.com/jedbridges/tgb/pull/39) |
| 2a Texts collection, source map for 51 works, fetch script | Done. The build container cannot reach the sources, so the owner runs the fetch on a Mac and commits the sections: 51 works, 2,223 sections in [#41](https://github.com/jedbridges/tgb/pull/41). The regenerated sections after the parser fix are in: 2,220 sections, verse line by line, chapters numbered, front and back matter gone. A second batch of 33 works, 570 sections, is in a branch pending PR: the parser needed three more fixes (a translator's-name heading that opens the text proper rather than dropping it as an appended piece, a heading whose text sits in a nested element, a section named for the guide's title when the file gives none, scenes and prologues carrying their act or tale) | [#40](https://github.com/jedbridges/tgb/pull/40), [#41](https://github.com/jedbridges/tgb/pull/41) |
| 2b Passage index | Done. Text pages index as Passage in the one Pagefind index, 44 MB on disk, 186 KB to open the palette and 100 to 200 KB a query; a second index is not needed at this volume | [#40](https://github.com/jedbridges/tgb/pull/40), [#41](https://github.com/jedbridges/tgb/pull/41) |
| 2c Text pages, search inside, guide highlights beside the contents | Reviewed on the real texts: headings, contents and passage pages right; verse, speeches and epigraphs reviewed on the regenerated texts in Chromium | [#40](https://github.com/jedbridges/tgb/pull/40), [#41](https://github.com/jedbridges/tgb/pull/41) |
| 2d SEO for text pages | Done for the passages: `src/lib/passages.ts` places each guide's marked passages in the section of the text they fall in. Across both batches, 84 works and 2,790 sections: 306 of 368 marked passages placed, 213 sections carry one. A section with a passage shows it with the guide's note and a link back, drops its noindex and joins the sitemap with a lastmod. Bare text stays out. Theme passage pages and Quotation markup shipped in [#41](https://github.com/jedbridges/tgb/pull/41). Two second-batch works place nothing: Faust's highlights quote the German with a literal gloss against an English verse translation numbered in bare Roman numerals rather than named scenes, and the fetched Hippocrates volume (Gutenberg 72583) does not contain the Aphorisms, the Sacred Disease or the Oath that its highlights cite; a different edition would be needed for those three | [#40](https://github.com/jedbridges/tgb/pull/40), [#41](https://github.com/jedbridges/tgb/pull/41), [#42](https://github.com/jedbridges/tgb/pull/42) |
| 3a Cloudflare AI Search over R2 | Live. Bucket `tgb-corpus` and AI Search instance `tgb-ask` (R2 source). Every deploy runs `npm run corpus` and `scripts/sync-corpus.ts`, which uploads 3,886 documents (689 guides, 2,790 text sections, 327 authors, 71 shelves, 9 programs) with url, title and kind as R2 metadata, and deletes anything the export dropped. The sync step is non-blocking: a failure leaves the last corpus in place and the site still deploys. AI Search does not re-index on upload; it syncs on its own schedule, so after a large change press Sync on the instance. `worker/index.ts` answers `POST /api/ask` with its own system prompt (direct answer, works by title and author, no file names) and derives source links from the corpus path when metadata is missing. Rate limited in the Worker: 6 questions a minute per visitor and 60 a minute sitewide, a ceiling on AI spend | [#47](https://github.com/jedbridges/tgb/pull/47), [#48](https://github.com/jedbridges/tgb/pull/48), [#49](https://github.com/jedbridges/tgb/pull/49), [#50](https://github.com/jedbridges/tgb/pull/50) |
| 3b Ask tab and cited answers | Live. Search and Ask tabs share one question: switching tabs answers what is typed, and the last answer is kept so switching back costs no second call. Prose answer, superscript links, a numbered source list, and a line saying the retrieval set is the site's own writing and public domain texts. `ask_used` (length) and `ask_citation` (rank) reach GA4, never the question. Answer quality on the live index not yet judged after the prompt change | [#47](https://github.com/jedbridges/tgb/pull/47), [#50](https://github.com/jedbridges/tgb/pull/50) |
| 3c SEO: reviewed question pages | Waiting on data: a few weeks of `ask_used` in GA4 shows which questions recur. Groundwork done: `robots.txt` disallows `/api/`, `llms.txt` lists the 82 texts with marked passages. Claude through AI Gateway (plan 3a) also not started; it needs an Anthropic API key from the owner | [#49](https://github.com/jedbridges/tgb/pull/49) |

Environment asks still open: allow `standardebooks.org` and `www.gutenberg.org` for Phase 2, then run `npx tsx scripts/fetch-texts.ts` and fix any source URL it reports;
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
- Shipped after 1g in [#41](https://github.com/jedbridges/tgb/pull/41): lastmod on every
  sitemap entry and dateModified on Book and Person markup, both from git and from content
  changes only; a publisher Organization on the WebSite and Book markup; IndexNow on every
  deploy for pages changed in the last three days; llms.txt regenerated at build with every
  page kind, and llms-full.txt with the shelf notes, program descriptions and an index of
  all 689 works.

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

## Verification record

Kept so a later session knows what was checked and how, not only what was built.

- 26 September 2026, after [#41](https://github.com/jedbridges/tgb/pull/41): every internal
  link in the built site resolves (77,386 checked). Axe clean on 24 renders of the theme,
  passages, length, difficulty, program and book pages at phone and desktop width in light
  and dark, with the palette open on one. Mobile Lighthouse on the theme, passages and
  length pages: performance 96 to 98, accessibility, best practices and SEO 100, total
  blocking time 0 ms, layout shift under 0.005. A code review of the search module and the
  fetch script produced ten findings, all fixed in that PR.
- 26 September 2026, texts: after the owner's fetch on a Mac, the built site was rebuilt
  with all 2,223 sections (98 s, dist 230 MB, Pagefind 44 MB) and the Hamlet, Lucretius,
  Karamazov and Montaigne text pages screenshotted in Chromium. Headings read "Act I, Scene
  IV" and "Part I, I: Fyodor Pavlovitch Karamazov". Verse ran together as prose because
  tidy() stripped the two space line breaks; fixed in the parser along with the epigraph
  headings in Middlemarch, the surviving "Footnotes:" and contents sections, and Jowett's
  introduction to the Republic. The fix was checked on fixture HTML, then the owner reran the
  script and the regenerated Lucretius, Hamlet, Middlemarch and Republic pages were
  screenshotted: verse line by line, speeches and stage directions flush, epigraphs as
  quotations under "Chapter I", the Republic opening on Book I.
- 27 September 2026, passages in the text: the placement was run over all 230 marked
  passages and every result read by hand; the misses that were wrong (a Purgatorio canto in
  the Inferno, "Volume III" against "Book III", Book 7 of a Books I to IV Herodotus) were
  fixed and the run repeated. The Republic Book I and Hamlet Act III Scene I pages were
  screenshotted at desktop and phone width with the passage block under the text. The
  sitemap was checked for the 203 text URLs and their lastmod, and noindex for a section
  with no passage. Known parser gaps for the next fetch run: the Oresteia parsed to its
  introductory note only, and Kant's "First Section" heading was taken for an epigraph.
- 27 September 2026, the hint that led nowhere: "justice" from the palette's own hint
  returned thirty books and never the Justice theme page, because Pagefind ranks by term
  density and a short theme page never reached the cut where the exact-title promotion
  looks. `search()` now runs a second small query for the page kinds that are not books
  and merges them before promotion; justice, tragedy, Renaissance and sophomore each lead
  with their own page in Chromium. On the live site the same query returned nothing at
  all, which fits a browser holding a cached `pagefind-entry.json` from before a deploy
  and asking for index chunks that no longer exist: `public/_headers` now revalidates the
  entry, script, worker and wasm on every load and caches the hashed chunks for a year.
- 27 September 2026, site critique: a dual-assessment design critique of the whole site
  scored 27/40 (snapshot in `.impeccable/critique/`). Fixed the same day: the phone menu
  clipped by the glass header (P0), the book page's order (synopsis before the edition,
  buy bar after the argument), the always-true guide facet, pill and chip, the palette's
  failing worked example and its silent wait, the author facet behind the disclosure, and
  a wayfinding strip on text sections. Left for later, recorded here so the next session
  sees them: line length of 87 to 98 characters on guide prose and text pages, theme and
  passages pages unpaged at 148 cards and 80 headings, the era bars in dark mode, the
  "Shelves" palette group name, and the question whether passage-in-context pages should
  replace full sections as the indexable unit of the text layer.
- 27 September 2026, second batch of texts: 33 more works fetched by the owner on a Mac.
  Two failed outright, Gorgias and Clouds, both "nothing parsed": Gorgias because the
  walker read the dialogue's own "Translated by Benjamin Jowett" heading, the one after
  the introduction, as an appended piece and dropped everything past it; Clouds because
  its headings carry their text in a nested element the walker's title-reading missed, and
  its speeches sit as bare text in divs with no paragraph tag the walker read. Fixed and
  verified against fixture HTML built from the real headings the owner pasted, then the
  owner reran the fetch. A second pass over the real output found four more faults: a file
  with no readable heading named its lone section "Text" instead of the work's own title, a
  scene heading with no act and a tale's "The Prologue" with no tale name, a translator's
  note and the play that follows it both named after the play so Antigone held two
  sections called Antigone, and the Politics skip pattern matched only at the head of a
  path so the publisher's imprint page survived. Fixed and reran once more; the build
  passed content validation and `astro check` with 84 works and 2,790 text sections, and
  the placement run above covers this batch. Not yet done: a full read of the new pages in
  a browser (Politics book numbering, Macbeth's five acts, City of God's books, Chaucer's
  tale order, Summa's questions) and the PR for this batch.
- 27 September 2026, Cloudflare AI Search infrastructure and the Ask tab: `sync-corpus.ts`
  and `worker/index.ts` written, `wrangler deploy --dry-run` confirms both bindings resolve
  and the Worker bundles. The palette's Search/Ask tabs were screenshotted in Chromium at
  desktop and phone width, the switch between them, and a mocked answer with two sources
  and superscript links. Not yet verified: a real deploy, whether AI Search re-indexes on
  its own once R2 changes or needs a triggered sync, and the answer quality and citation
  accuracy of a live question against the real corpus.
- 27 September 2026, going live: the deploy workflow was invalid (GitHub rejects the
  secrets context in a step's `if:`), so nothing deployed after the Ask tab merged; fixed by
  checking the secrets in the shell. The first sync then failed on a swapped R2 key pair and
  blocked the deploy; the step now continues on error. With the keys fixed the sync uploaded
  3,886 documents and a manual Sync on the instance started indexing all of them. The first
  live answer ("who was the best leader of Rome") showed Cloudflare's default prompt: it
  cited corpus paths, opened "According to the provided documents" and hedged; its sources
  were all dropped because the R2 objects carried no metadata. Both fixed in #50.
- 28 September 2026, closing the leftovers: the measure went from 68ch to 58ch, taking
  guide and text pages from a median of 79 and 86 characters a line to 74 on both
  (measured in Chromium). Theme pages show 36 of their books and passages pages 15 works,
  with a button for the rest; the full list stays in the HTML, and without script all 148
  render. The "Shelves" search group is now "Difficulty and length". The era bars' top rule
  was checked in dark mode and already shows. A browser read of the second batch found
  Macbeth's short Scene I folded into Scene II, the Politics' eight books reduced to eight
  runs of Chapter I, the Summa opening on its translators' front matter, and footnote
  markers in City of God and Chaucer headings; the parser now keeps a short opening unit's
  name, numbers restarted chapter runs as books, and cases unit headings, and the source
  map skips the Summa's front matter. These need a fetch run on the owner's Mac, which also
  adds seven works: Bacchae, Hippolytus, Frogs, Livy, Novum Organum, Euclid and Tacitus.
- The query suite the palette is checked against, run in Chromium against the built site:
  Plato, Republic, justice, Iliad, Ilias, sophomore, approachable epic, tragedy, Greek
  tragedy, short novel, easy long novels, happiness, Dostoevski, Neitzsche, xqzv, St Johns,
  Lit Hum, Politeia, Vom Kriege, Shylock, Britannica, Austen, Yale. Expected leaders are the
  author page, the exact title or alias, the theme page, the program page, or the filtered
  shelf, and a misspelling reaches the empty state with a suggestion.

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
