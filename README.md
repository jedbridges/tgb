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

Live at **https://tgb.bridges-site.workers.dev**

Deploy from this machine, where wrangler is already signed in:

```bash
SITE_URL=https://tgb.bridges-site.workers.dev npm run build && npx wrangler deploy
```

`SITE_URL` must be set at build time. It is baked into canonical URLs, the sitemap and
OpenGraph tags, and `npm run smoke` fails the build if the canonicals disagree with it.

Deploying from GitHub Actions instead needs a scoped API token, because the local
wrangler login is an OAuth token that cannot be shared with CI. Create one with the
"Edit Cloudflare Workers" template and add it as `CLOUDFLARE_API_TOKEN`, along with
`CLOUDFLARE_ACCOUNT_ID` (857288c4525ed3168fa33c44527ab5ee) and `SITE_URL`.
`AMAZON_ASSOCIATE_TAG`, `BOOKSHOP_AFFILIATE_ID` and `PUBLIC_GA4_ID` are optional.

To move to a custom domain later: add it under the Worker's Domains and Routes, then
rebuild with the new `SITE_URL`. No code changes; paths are all root-relative.
