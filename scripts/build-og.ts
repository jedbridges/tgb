/**
 * Builds the share card and the icons.
 *
 * The headline is set in the site's own face, Gambetta, by converting the text to outlines.
 * sharp renders SVG through librsvg, which only sees fonts installed on the machine, so
 * embedding a webfont would silently fall back to a system serif. Outlines make the card
 * look identical everywhere and install nothing.
 *
 * The mark, the red and the outline machinery live in ./lib/brand.ts, shared with the
 * social images, because when this script kept its own copy the card drifted onto a red
 * that existed nowhere else on the site.
 *
 *   npx tsx scripts/build-og.ts
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { RED, CREAM, mark, markScaleForWidth, markHeightForWidth, loadFonts, setText } from './lib/brand.ts';

const W = 1200, H = 630;
const M = 104;
const { roman, italic } = loadFonts();

/** One line of the card, with a guard against running off the edge. */
function line(o: Parameters<typeof setText>[0]) {
  const r = setText(o);
  if (r.right > W - M) throw new Error(`"${o.text}" runs to ${Math.round(r.right)}, past the ${W - M} margin`);
  return r;
}

// Layout: one optical margin, a mark, the wordmark, a rule measured to the type above it,
// and one line of fact. Everything hangs off the same left edge and the block is centred
// vertically, so the card is balanced rather than top-heavy.
const wordmark = line({ font: italic, text: 'The Great Books', size: 118, x: M, y: 368 });
/* "works that defined the West" would not be true of this list: 55 of the 689 come from
   outside it, from the Qur'an and Ibn Khaldun to the Analects. What is true is that the
   West built on them, which is why nine of its own curricula still assign them. */
const strap = line({
  font: roman, text: '689 works the West was built on', size: 42, x: M, y: 454, opacity: 0.88,
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${RED}"/>
  ${mark(W - 250, H - 300, 0.3, CREAM, 0.13)}
  ${mark(M, 176, 0.05)}
  ${wordmark.svg}
  <rect x="${M}" y="400" width="${Math.round(wordmark.right - M)}" height="2" fill="${CREAM}" opacity="0.4"/>
  ${strap.svg}
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og-default.png');

/**
 * The mark is 1.74 times wider than it is tall, so fitting it inside a square with even
 * padding left it filling barely half the width: at the sixteen pixels a browser tab
 * actually shows, the three page curves dissolved into a smear. It now runs almost the
 * full width and is centred on the height.
 */
const icon = (size: number) => {
  const w = size * 0.82;
  const x = (size - w) / 2;
  const y = (size - markHeightForWidth(w)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${RED}"/>
    ${mark(x, y, markScaleForWidth(w))}
  </svg>`;
};
writeFileSync('public/favicon.svg', icon(64));
await sharp(Buffer.from(icon(180))).png().toFile('public/apple-touch-icon.png');

const meta = await sharp('public/og-default.png').metadata();
console.log(
  `share card ${meta.width}x${meta.height}\n` +
  `  wordmark  ${Math.round(wordmark.left)} -> ${Math.round(wordmark.right)}\n` +
  `  strapline ${Math.round(strap.left)} -> ${Math.round(strap.right)} (margin at ${W - M})\n` +
  `  icons written, mark fills ${Math.round((1 - 2 * 0.09) * 100)}% of the icon width`,
);
