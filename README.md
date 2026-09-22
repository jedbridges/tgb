# The Great Books

Every book the great college reading lists ask students to read, on one shelf: the definitive cross-program list, a reading guide for each work, and where to buy the right edition.

Static site built with [Astro](https://astro.build), hosted on Cloudflare Workers static assets, deployed by GitHub Actions.

## Develop

```bash
npm install
npm run dev              # http://localhost:4321
npm run validate:content # editorial checks beyond the schema
npm run build            # astro check + build + Pagefind index + smoke checks
npm run preview
```

Copy `.env.example` to `.env` to set affiliate IDs, analytics and the site URL locally.

## Content

- `src/content/programs/*.yaml`: one file per reading list, in the program's own order. Programs own ordering; works never list their programs.
- `src/content/works/*.md`: one file per work. Frontmatter is the catalogue entry; the body is the reading guide. `status` moves stub → draft → reviewed → published.
- `src/content/authors/*.md`, `src/content/taxonomies/*.yaml`.
- `content/STYLE.md` is the voice and structure guide. `content/CONVENTIONS.md` covers slugs.
- `npm run seed` lists works referenced by programs that have no file yet. `npm run covers` fetches cover images from Open Library into `src/assets/covers/`.

## Deploy

Push to `master`. Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SITE_URL`, and optionally `AMAZON_ASSOCIATE_TAG`, `BOOKSHOP_AFFILIATE_ID`, `PUBLIC_GA4_ID`.
