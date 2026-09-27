# The Great Books: working notes for Claude

Astro 7 static site (greatbookslist.com), content collections in `src/content`, deployed to
Cloudflare on every push to `master` by `.github/workflows/deploy.yml`. Work on a feature
branch and open a PR; the owner merges. README.md has the commands.

## Read first

- `docs/search-plan.md` is the living plan for search, the text layer and AI answers. Its
  Status table says what is done, what is blocked and on what. Update it at the end of any
  session that touches search, and record what was verified in its Verification record.
- `.claude/skills/impeccable/` is installed; run `/impeccable context` before design work.
  There is no PRODUCT.md or DESIGN.md yet; the incumbent CSS and components are the
  design authority.

## Checks that must pass before a push

```bash
npm run validate:content   # editorial rules: word counts, related slugs, banned phrases, em dashes, duplication
npx astro check            # types, 0 errors expected (two zod deprecation warnings are known)
npm run build              # astro check + build + Pagefind index + smoke-dist
```

CI (`.github/workflows/ci.yml`) runs the same on every PR.

## Conventions the validator and the owner enforce

- No em dashes anywhere, in content, code comments or messages. Use a comma, a colon or a
  full stop.
- Prose in content is plain, specific and unhedged; no "delve", no "tapestry", no
  sentence that could be about any book. Author bios are one paragraph, 85 to 110 words.
- Every slug referenced in front matter (`related`, `startHere`, `pairing`, `work`) must
  exist as a file; the build fails on a dangling one several minutes in, so check first.
- YAML flow lists (`aliases: [...]`) need quotes around any value containing `:` `?` `#`
  or a comma.
- Commit messages explain why in prose, wrapped, no bullet lists of files. Never put a
  model name in a commit, PR or code comment.

## Where things live

- Works, authors, programs, taxonomies: `src/content/{works,authors,programs,taxonomies}`.
  Shelf notes (the essay on each theme, era, form, difficulty and length page):
  `src/content/shelf-notes/{kind}-{id}.md`. Public domain texts: `src/content/texts/{work}/`,
  written only by `scripts/fetch-texts.ts` from `src/content/text-sources.yaml`.
- Search: `src/lib/search.ts` is the one module both the palette
  (`src/components/SearchPalette.astro`) and the browse island
  (`src/components/browse/Browse.tsx`) use. Facets on pages are `data-pagefind-filter`
  attributes carrying ids; display values are `data-pagefind-meta`. Add a new page kind by
  giving it a `type` meta and a `Group` in `search.ts`.
- Passages in the texts: `src/lib/passages.ts` places each guide's marked passages in a
  section by the location's structure and the passage's words; the section page, the
  contents page and the sitemap filter all read it. A section is indexable only with one.
- SEO: canonical and robots in `src/components/Seo.astro`; sitemap filter in
  `astro.config.mjs` (stubs and `/text/` pages are excluded); JSON-LD helpers in
  `src/lib/seo.ts`.
- Verification tooling (Playwright, axe, Lighthouse) is installed in the session scratchpad,
  not the repo; Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Environment

- The cloud environment's network policy decides which hosts scripts can reach. The text
  fetch needs `standardebooks.org` and `www.gutenberg.org`; the covers job needs
  `openlibrary.org`, `covers.openlibrary.org` and `archive.org`; both were denied as of
  September 2026. `googleapis.com` is reachable but rate limited per minute.
- `.env` is gitignored and holds `GOOGLE_BOOKS_API_KEY`; never commit it or echo it.
