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
const books = pages.filter((p) => /\/books\/[^/]+\/index\.html$/.test(p));
let jsonldBad = 0, tagBad = 0, imgBad = 0;
for (const p of books) {
  const html = readFileSync(p, 'utf8');
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  try { lds.forEach((m) => JSON.parse(m[1])); if (!lds.some((m) => m[1].includes('"Book"'))) jsonldBad++; } catch { jsonldBad++; }
  if (tag && !html.includes(`tag=${tag}`)) tagBad++;
  for (const img of html.matchAll(/<img\b[^>]*>/g)) if (!/\bwidth=/.test(img[0]) || !/\bheight=/.test(img[0])) imgBad++;
}
books.length ? ok(`${books.length} book pages`) : console.log('· no book pages yet');
jsonldBad ? fail(`${jsonldBad} book pages with missing/invalid Book JSON-LD`) : books.length && ok('Book JSON-LD present and valid');
tagBad ? fail(`${tagBad} book pages missing affiliate tag`) : tag && ok('affiliate tag on every book page');
imgBad ? fail(`${imgBad} <img> without width/height`) : ok('all <img> have dimensions');
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
if (process.exitCode) process.exit(1);
