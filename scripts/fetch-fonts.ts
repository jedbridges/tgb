/**
 * Downloads the Fontshare families and writes the self-hosted @font-face CSS.
 *
 * Fontshare is not on fontsource, so the files come from its CDN once and are committed.
 * The live site then loads nothing from a third party: no extra DNS, no outage that can
 * take the typography down, and no request leaving the visitor's browser to another host.
 *
 * Both families are free for commercial use under the ITF Free Font License.
 *
 *   npx tsx scripts/fetch-fonts.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/fonts';
mkdirSync(OUT, { recursive: true });

/**
 * Requested without a weight specifier on purpose. Fontshare's API is unreliable when you
 * ask for specific weights: `gambetta@400` came back carrying Switzer, and `gambetta@401`
 * carrying Satoshi. A bare family name returns that family's full set, and we filter here.
 */
const QUERY = [
  // Only what the stylesheets actually ask for. Gambetta needs no bold: its 500 carries
  // every heading, and the spine lettering sits at 500 too. Satoshi needs no italic:
  // every italic on the site is display type, which is always Gambetta.
  { family: 'gambetta', keep: ['400', '500'], italics: true },
  { family: 'satoshi', keep: ['400', '500', '700'], italics: false },
];

interface Face { family: string; weight: string; style: string; url: string }

/** The CDN intermittently refuses one address family, so a single failure is not an answer. */
async function grab(url: string, tries = 4): Promise<Buffer> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error(`Could not fetch ${url}: ${last}`);
}

async function facesFor(family: string, keep: string[], italics: boolean): Promise<Face[]> {
  // One family per request: asking for two at once silently returns the wrong family.
  const css = (await grab(`https://api.fontshare.com/v2/css?f[]=${family}&display=swap`)).toString('utf8');
  const out: Face[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const fam = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? 'normal';
    // URLs are protocol-relative, so they need a scheme before fetching.
    const url = /url\('(\/\/[^']+\.woff2)'\)/.exec(block)?.[1];
    if (!fam || !weight || !url) continue;
    // The API sometimes mixes in another family; drop those rather than ship them.
    if (fam.toLowerCase().replace(/\s+/g, '') !== family) continue;
    if (!keep.includes(weight)) continue;
    if (style === 'italic' && !italics) continue;
    out.push({ family: fam, weight, style, url: `https:${url}` });
  }
  if (!out.length) throw new Error(`No faces returned for ${family}`);
  return out;
}

const rules: string[] = [];
let total = 0;
for (const { family, keep, italics } of QUERY) {
  const faces = await facesFor(family, keep, italics);
  if (italics && !faces.some((f) => f.style === 'italic')) {
    throw new Error('Gambetta italic missing; the site sets its display type in italic.');
  }
  for (const f of faces) {
    const name = `${family}-${f.weight}${f.style === 'italic' ? 'i' : ''}.woff2`;
    const buf = await grab(f.url);
    writeFileSync(`${OUT}/${name}`, buf);
    total += buf.length;
    rules.push(
      `@font-face {\n  font-family: '${f.family}';\n  src: url('/fonts/${name}') format('woff2');\n  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: swap;\n}`,
    );
    console.log(`  ${name.padEnd(22)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB`);
  }
}

writeFileSync(
  'src/styles/fonts.css',
  `/* Self-hosted from Fontshare by scripts/fetch-fonts.ts. Do not edit by hand.\n   Gambetta and Satoshi, free for commercial use under the ITF Free Font License. */\n\n${rules.join('\n\n')}\n`,
);
console.log(`\n${rules.length} faces, ${(total / 1024).toFixed(0)} KB on disk, written to src/styles/fonts.css`);
