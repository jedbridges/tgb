// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

const site = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    preact(),
    sitemap({
      // /type is a temporary specimen: unlisted, unindexed, out of the sitemap.
      filter: (page) => !page.includes('/404') && !page.includes('/type'),
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
