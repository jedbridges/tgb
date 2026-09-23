// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
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
      filter: (page) => !page.includes('/404'),
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
