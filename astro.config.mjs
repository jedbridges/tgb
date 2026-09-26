// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import { readdirSync, readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import { loadEnv } from 'vite';

/*
 * astro.config runs before Astro loads .env into import.meta.env, so process.env here only
 * ever held what the shell exported. A local build therefore silently fell back to the dev
 * origin and shipped it: canonicals, the sitemap and every share image on the deployed site
 * read http://localhost:4321. loadEnv reads the .env file the same way Vite does, so the
 * file is now the single place the origin is declared, and scripts/smoke-dist.ts fails the
 * build if it is still missing.
 */
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const SITE_URL = process.env.SITE_URL || env.SITE_URL;
const site = (SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
// Hand it to the rest of the build, which reads process.env.
if (SITE_URL) process.env.SITE_URL = SITE_URL;
for (const k of ['AMAZON_ASSOCIATE_TAG', 'BOOKSHOP_AFFILIATE_ID', 'PUBLIC_GA4_ID'])
  if (!process.env[k] && env[k]) process.env[k] = env[k];

/*
 * The sitemap is a request, not an inventory: it says which pages we want judged. 595 of the
 * 689 works are still catalogue stubs, so asking Google to weigh them against the 94 written
 * guides is asking to be read as a thin affiliate site. They are noindexed on the page itself
 * and dropped here, and a work rejoins both the moment its status stops being 'stub'.
 *
 * Read with a regex rather than a YAML parser because astro.config runs before the content
 * layer exists, and the only field needed is one line of frontmatter.
 */
const stubSlugs = new Set(
  readdirSync('src/content/works')
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /^status:\s*stub\s*$/m.test(readFileSync(`src/content/works/${f}`, 'utf8')))
    .map((f) => f.replace(/\.md$/, '')),
);

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  /*
   * Fetch the page before the click.
   *
   * A book on the shelf lifts under the pointer and then sat there while the browser went
   * and got the page it was already pointing at. Hovering a link now starts the fetch, so
   * by the time the click lands the document is usually in the cache and the transition has
   * something to transition to. It costs one small script and only fires on hover, so a
   * reader scrolling past 689 books downloads nothing.
   */
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  build: { format: 'directory' },
  integrations: [
    preact(),
    sitemap({
      filter: (page) => {
        if (page.includes('/404')) return false;
        // The type specimen is a working page for the site's own typography, noindexed on
        // the page itself; listing it here told search the opposite.
        if (/\/type\/?$/.test(page)) return false;
        const m = page.match(/\/books\/([^/]+)\/?$/);
        return !(m && stubSlugs.has(m[1]));
      },
    }),
    pagefind(),
  ],
  image: {
    // One modern format. The jpg fallbacks were 362 files nothing current requests.
    formats: ['webp'],
  },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
