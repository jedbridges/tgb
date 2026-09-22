/**
 * Builds the share card and the icons.
 *
 * The headline is set in the site's own face, Gambetta, by converting the text
 * to outlines with opentype.js. sharp renders SVG through librsvg, which only sees fonts
 * installed on the machine, so embedding a webfont would silently fall back to a system
 * serif. Outlines make the card look identical everywhere and install nothing.
 *
 *   npx tsx scripts/build-og.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import opentype, { type Font } from 'opentype.js';

const RED = '#a81f00';       // deep enough that cream type clears AA comfortably
const CREAM = '#f4ece6';
const W = 1200, H = 630;

const FONTS = {
  italic: '.cache/fonts/Gambetta-400i.ttf',
  roman: '.cache/fonts/Gambetta-400.ttf',
};
for (const p of Object.values(FONTS)) {
  if (!existsSync(p)) throw new Error(`Missing ${p}. Fetch the TTFs from google/fonts first.`);
}

/** Static TTFs from Fontshare, the same outlines the site serves as woff2. */
const load = (p: string) => opentype.parse(readFileSync(p).buffer.slice(0) as ArrayBuffer);
const italic = load(FONTS.italic);
const roman = load(FONTS.roman);

interface Line { font: Font; text: string; size: number; x: number; y: number; letterSpacing?: number; opacity?: number }

/** Outline one line and report its measured width, so the caller can centre or rule to it. */
function line({ font, text, size, x, y, letterSpacing = 0, opacity = 1 }: Line) {
  const path = font.getPath(text, x, y, size, { letterSpacing: letterSpacing / size });
  const { x2 } = path.getBoundingBox();
  const d = path.toPathData(2);
  return { svg: `<path d="${d}" fill="${CREAM}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`, right: x2 };
}

const MARK = (x: number, y: number, scale: number, opacity = 1) => `<g transform="translate(${x},${y}) scale(${scale})" fill="${CREAM}"${opacity < 1 ? ` opacity="${opacity}"` : ''}>
<path d="M1681.625,391.685c-220.914-220.913-579.086-220.913-800,0v-226c220.914-220.913,579.086-220.913,800,0Z"/>
<path d="M1681.625,965.685c-220.914-220.914-579.086-220.914-800,0v-226c220.914-220.914,579.086-220.914,800,0Z"/>
<path d="M1681.625,678.685c-220.914-220.914-579.086-220.914-800,0v-226c220.914-220.914,579.086-220.914,800,0Z"/>
<path d="M800,965.685c-220.914-220.914-579.086-220.914-800,0v-800c220.914-220.913,579.086-220.913,800,0Z"/></g>`;

// Layout: one optical margin, a mark, the wordmark, a rule measured to the type above it,
// and one line of fact. Everything hangs off the same left edge and the block is centred
// vertically, so the card is balanced rather than top-heavy.
const M = 104;
const wordmark = line({ font: italic, text: 'The Great Books', size: 118, x: M, y: 368 });
const strap = line({
  font: roman, text: '689 works · nine reading lists', size: 40, x: M, y: 452, opacity: 0.86,
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${RED}"/>
  ${MARK(W - 250, H - 300, 0.3, 0.13)}
  ${MARK(M, 176, 0.05)}
  ${wordmark.svg}
  <rect x="${M}" y="400" width="${Math.round(wordmark.right - M)}" height="2" fill="${CREAM}" opacity="0.4"/>
  ${strap.svg}
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og-default.png');

const icon = (size: number) => {
  const pad = size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${RED}"/>
    ${MARK(pad, size * 0.31, (size - 2 * pad) / 1681.625)}
  </svg>`;
};
writeFileSync('public/favicon.svg', icon(64));
await sharp(Buffer.from(icon(180))).png().toFile('public/apple-touch-icon.png');

const meta = await sharp('public/og-default.png').metadata();
console.log(`share card ${meta.width}x${meta.height}, wordmark ends at x=${Math.round(wordmark.right)}, icons written`);
