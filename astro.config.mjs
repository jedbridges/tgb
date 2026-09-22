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
