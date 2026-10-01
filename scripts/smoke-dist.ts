/** Post-build assertions on dist/. Fails the build on silent misconfiguration. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * This runs as its own process, so it cannot inherit what astro.config resolved. It reads
 * the same .env file rather than trusting the shell, which is what lets the origin be
 * declared in exactly one place.
 */
for (const line of existsSync('.env') ? readFileSync('.env', 'utf8').split('\n') : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const dist = 'dist';
const fail = (m: string) => { console.error(`✗ ${m}`); process.exitCode = 1; };
const ok = (m: string) => console.log(`✓ ${m}`);
if (!existsSync(dist)) { fail('dist/ missing'); process.exit(1); }

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, out) : p.endsWith('.html') && out.push(p); }
  return out;
}
const pages = walk(dist);
ok(`${pages.length} html pages`);
for (const f of ['index.html', '404.html', 'sitemap-index.xml']) existsSync(join(dist, f)) ? ok(f) : fail(`${f} missing`);

const tag = process.env.AMAZON_ASSOCIATE_TAG?.trim();
const shop = process.env.BOOKSHOP_AFFILIATE_ID?.trim();
const books = pages.filter((p) => /\/books\/[^/]+\/index\.html$/.test(p));
let jsonldBad = 0, tagBad = 0, shopBad = 0, imgBad = 0;
for (const p of books) {
  const html = readFileSync(p, 'utf8');
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  try { lds.forEach((m) => JSON.parse(m[1])); if (!lds.some((m) => m[1].includes('"Book"'))) jsonldBad++; } catch { jsonldBad++; }
  if (tag && !html.includes(`tag=${tag}`)) tagBad++;
  if (shop && !html.includes(`bookshop.org/a/${shop}/`) && !html.includes(`affiliate=${shop}`)) shopBad++;
  for (const img of html.matchAll(/<img\b[^>]*>/g)) if (!/\bwidth=/.test(img[0]) || !/\bheight=/.test(img[0])) imgBad++;
}
books.length ? ok(`${books.length} book pages`) : console.log('· no book pages yet');
jsonldBad ? fail(`${jsonldBad} book pages with missing/invalid Book JSON-LD`) : books.length && ok('Book JSON-LD present and valid');
tagBad ? fail(`${tagBad} book pages missing affiliate tag`) : tag && ok('Amazon tag on every book page');
shopBad ? fail(`${shopBad} book pages missing the Bookshop affiliate id`) : shop && ok('Bookshop id on every book page');
// Analytics is the only way to know which page earned a click, so a build that thinks it
// has analytics and does not is worth catching here rather than in three months of blank
// reports. Both halves are checked: the tag that loads GA4, and the listener that reports
// an affiliate click to it.
const ga = process.env.PUBLIC_GA4_ID?.trim();
if (ga) {
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  if (!home.includes(ga)) fail(`PUBLIC_GA4_ID is set but ${ga} does not appear in the built pages`);
  else {
    const scripts = existsSync(join(dist, '_astro'))
      ? readdirSync(join(dist, '_astro')).filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(join(dist, '_astro', f), 'utf8')).join('')
      : '';
    scripts.includes('affiliate_click')
      ? ok(`analytics ${ga}, with affiliate click tracking`)
      : fail('GA4 is configured but the affiliate click listener is not in the bundle');
  }
}

// A workers.dev URL is only wrong when it is NOT the configured origin, i.e. a stale hardcode
// left behind after moving to a custom domain.
const site = (process.env.SITE_URL ?? '').trim();
if (!site.includes('workers.dev')) {
  const stale = pages.filter((p) => readFileSync(p, 'utf8').includes('workers.dev'));
  if (stale.length) fail(`${stale.length} pages reference workers.dev but SITE_URL is ${site || '(unset)'}`);
  else ok('no stale workers.dev references');
} else {
  ok(`origin is ${site}`);
}
/*
 * The origin has to be declared, not defaulted.
 *
 * This check used to be skipped whenever SITE_URL was unset, which is precisely the case
 * that goes wrong: astro.config falls back to the dev origin, the build succeeds, and the
 * deployed site tells every crawler and every share preview that it lives on localhost.
 * That shipped. An unset origin is now a failure, and the fallback is only ever a
 * convenience for `astro dev`.
 */
if (!site) {
  fail(
    'SITE_URL is unset, so every canonical, sitemap entry and share image in this build ' +
    'points at the dev origin. Copy .env.example to .env, or set it in the environment.',
  );
} else {
  const bad = pages.filter((p) => { const h = readFileSync(p, 'utf8'); const m = h.match(/<link rel="canonical" href="([^"]+)"/); return m && !m[1].startsWith(site); });
  bad.length ? fail(`${bad.length} pages have a canonical outside ${site}`) : ok('canonicals match the configured origin');

  // The share image is the one absolute URL a reader never sees until it is already wrong.
  const ogBad = pages.filter((p) => { const m = readFileSync(p, 'utf8').match(/property="og:image" content="([^"]+)"/); return m && !m[1].startsWith(site); });
  ogBad.length ? fail(`${ogBad.length} pages have an og:image outside ${site}`) : ok('share images are on the configured origin');

  // And nothing anywhere may still name a dev origin.
  if (!/localhost|127\.0\.0\.1/.test(site)) {
    const devRefs = pages.filter((p) => /localhost:\d+|127\.0\.0\.1/.test(readFileSync(p, 'utf8')));
    devRefs.length
      ? fail(`${devRefs.length} pages still reference a dev origin, e.g. ${devRefs[0]}`)
      : ok('no dev origins in the build');
  }
  const sitemap = join(dist, 'sitemap-0.xml');
  if (existsSync(sitemap) && !readFileSync(sitemap, 'utf8').includes(`<loc>${site}`)) {
    fail(`sitemap-0.xml does not use ${site}`);
  } else if (existsSync(sitemap)) ok('sitemap uses the configured origin');
}
/*
 * Search-facing structure. Each check guards a change made to earn search traffic, and
 * each fails quietly in the browser if it regresses, so it is caught here instead.
 */
{
  const noindexed = new Set<string>();
  let titleLong = 0, picksMissing = 0, guided = 0, placementMissing = 0;
  const pathOf = (p: string) => '/' + p.slice(dist.length + 1).replace(/index\.html$/, '');
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    if (/<meta name="robots" content="noindex/.test(html)) noindexed.add(pathOf(p));
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    // Entities count as one character on a results page. Only the search-shaped titles
    // on book and program pages are held to this: a work whose own name is longer than a
    // results line is allowed its name, and text-section titles are named by their source.
    const appended = /: (Guide and )?Best (Translation|Edition)$|: All \d+ Books in Order$/.test(title);
    if (!noindexed.has(pathOf(p)) && appended && title.replace(/&[a-z#0-9]+;/gi, 'x').length > 70) titleLong++;
    if (/data-affiliate=/.test(html) && /<a [^>]*data-affiliate=(?![^>]*data-placement=)[^>]*>/.test(html)) placementMissing++;
    if (books.includes(p) && !noindexed.has(pathOf(p))) {
      guided++;
      // Every guided page with a named edition should answer "which translation".
      if (/Our pick|No edition recommended yet/.test(html) === false) picksMissing++;
    }
  }
  titleLong ? fail(`${titleLong} indexable pages have a <title> over 70 characters`) : ok('titles fit a results page');
  picksMissing ? fail(`${picksMissing} guided book pages have no "Which translation" section`) : ok(`${guided} guided book pages answer which translation`);
  placementMissing ? fail(`${placementMissing} pages have affiliate links without data-placement`) : ok('every affiliate link says where it sits');

  // The sitemap and the robots tag must agree, or search is told two things at once.
  const sm = join(dist, 'sitemap-0.xml');
  if (existsSync(sm) && site) {
    const listed = new Set([...readFileSync(sm, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
    const both = [...noindexed].filter((u) => listed.has(u));
    both.length ? fail(`${both.length} noindexed pages are in the sitemap, e.g. ${both[0]}`) : ok('no noindexed page is in the sitemap');
  }

  // Finder duplicates ("type 2.astro", "satoshi-400 2.woff2") once shipped as public pages.
  const dupes: string[] = [];
  const scan = (dir: string) => { for (const f of readdirSync(dir)) { const q = join(dir, f); if (/ \d+(\.[a-z0-9]+)?$/i.test(f)) dupes.push(q); if (statSync(q).isDirectory()) scan(q); } };
  scan(dist);
  dupes.length ? fail(`${dupes.length} Finder duplicate files in dist, e.g. ${dupes[0]}`) : ok('no Finder duplicates in dist');
  existsSync(join(dist, 'favicon.ico')) ? ok('favicon.ico present') : fail('favicon.ico missing');

  /*
   * The free page sends readers to other people's sites, which is a promise about what is
   * on the other end. Only the four public domain libraries, only over https, and never
   * marked sponsored: a free text is not an affiliate link and must not look like one.
   */
  const freePage = join(dist, 'free', 'index.html');
  if (existsSync(freePage)) {
    const html = readFileSync(freePage, 'utf8');
    const ALLOWED = ['standardebooks.org', 'www.gutenberg.org', 'en.wikisource.org', 'archive.org'];
    const bad: string[] = [];
    for (const m of html.matchAll(/<a\b[^>]*data-free=[^>]*>/g)) {
      const href = /href="([^"]+)"/.exec(m[0])?.[1] ?? '';
      const external = /^https?:/.test(href);
      if (external && (!href.startsWith('https://') || !ALLOWED.includes(new URL(href).host))) bad.push(href);
      if (/rel="[^"]*sponsored/.test(m[0])) bad.push(`${href} (marked sponsored)`);
    }
    bad.length ? fail(`${bad.length} bad free links, e.g. ${bad[0]}`) : ok('free links go to the public domain libraries only');
    /^\/free\/$/.test('/free/') && pathOf(freePage) === '/free/' && !noindexed.has('/free/')
      ? ok('/free/ is indexable')
      : fail('/free/ is noindexed');
  } else {
    fail('/free/ missing');
  }
}
if (process.exitCode) process.exit(1);
