/** Post-build assertions on dist/. Fails the build on silent misconfiguration. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
// Canonicals must match the configured origin, or the whole site self-reports the wrong address.
if (site) {
  const bad = pages.filter((p) => { const h = readFileSync(p, 'utf8'); const m = h.match(/<link rel="canonical" href="([^"]+)"/); return m && !m[1].startsWith(site); });
  bad.length ? fail(`${bad.length} pages have a canonical outside ${site}`) : ok('canonicals match the configured origin');
}
if (process.exitCode) process.exit(1);
