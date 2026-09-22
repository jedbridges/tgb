/**
 * Tells Bing and Yandex which pages exist, without an account.
 *
 * Google needs a verified Search Console property before it will take a submission, which
 * is the site owner's to do. IndexNow needs no account at all: a key is published at a
 * known URL on the site, and that proves ownership. It is worth the five minutes because
 * Bing's index feeds Copilot and parts of ChatGPT's search, so this is an answer-engine
 * move as much as a search one.
 *
 * Google is unaffected and does not need it: robots.txt already points at the sitemap.
 *
 *   npx tsx scripts/indexnow.ts           # what it would send
 *   npx tsx scripts/indexnow.ts --send    # actually send it
 */
import { readFileSync, readdirSync } from 'node:fs';

const HOST = 'greatbookslist.com';
const key = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f))?.replace('.txt', '');
if (!key) throw new Error('No IndexNow key file in public/. Expected a 32-character hex name.');

const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) throw new Error('No URLs in dist/sitemap-0.xml. Build first.');

console.log(`${urls.length} URLs, key ${key}`);
if (!process.argv.includes('--send')) {
  console.log('Dry run. Pass --send to submit.');
  process.exit(0);
}

// The API takes 10,000 per request; batching anyway keeps each payload small.
let sent = 0;
for (let i = 0; i < urls.length; i += 1000) {
  const batch = urls.slice(i, i + 1000);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: batch }),
  });
  // 200 accepted, 202 accepted but the key is still being checked. Both are fine.
  console.log(`  batch ${i / 1000 + 1}: ${batch.length} URLs -> HTTP ${res.status}`);
  if (res.ok || res.status === 202) sent += batch.length;
  else console.log('    ' + (await res.text()).slice(0, 160));
}
console.log(`\nsubmitted ${sent} of ${urls.length}`);
