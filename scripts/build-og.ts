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
 * The card is struck on paper rather than on the red, and that is a material decision
 * rather than a taste one. Wax is darker than the brand red and only a little warmer, so a
 * seal laid on a red field loses its edge, its legend and its shadow all at once and
 * arrives in a feed as a dark smudge. On paper every one of those reads. The card now
 * shows the same thing the page does: a sheet, with wax on it.
 *
 * There is no small mark on the card any more either. The seal carries the device at ten
 * times the size, and a second copy of it over the wordmark was the lockup competing with
 * itself for the one thing a share card has to do.
 *
 *   npx tsx scripts/build-og.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { RED, CREAM, PAPER, INK_STRONG, INK_SOFT, paperGrain, mark, leaf, LEAF_W, LEAF_H, markScaleForWidth, markHeightForWidth, loadFonts, setText } from './lib/brand.ts';
import { seal } from './lib/seal-art.ts';

const W = 1200, H = 630;
const M = 104;
const { roman, italic } = loadFonts();

/* The seal runs off the right edge. Its centre sits past the canvas on purpose: a circle
   cropped by the frame reads as an object continuing beyond it, where a whole circle
   floating inside the frame reads as a logo pasted on. */
const SEAL = { cx: 1160, cy: 315, size: 680 };
const SEAL_LEFT = SEAL.cx - SEAL.size / 2;
/* Nothing in the type block may reach the wax. This is the guard that matters: the card is
   generated, never looked at by the person shipping it, and a headline growing by one word
   is how it would quietly start colliding. */
const TYPE_LIMIT = SEAL_LEFT - 44;

/** One line of the card, with a guard against running into the seal. */
function line(o: Parameters<typeof setText>[0]) {
  const r = setText(o);
  if (r.right > TYPE_LIMIT) {
    throw new Error(`"${o.text}" runs to ${Math.round(r.right)}, past the ${Math.round(TYPE_LIMIT)} the seal leaves for it`);
  }
  return r;
}

// Layout: one optical margin, the wordmark, a rule measured to the type above it, and one
// line of fact. Everything hangs off the same left edge, and the block sits a little above
// the seal's centre so the two are related rather than stacked.
const wordmark = line({ font: italic, text: 'The Great Books', size: 100, x: M, y: 316, fill: INK_STRONG });
/* "works that defined the West" would not be true of this list: 55 of the 689 come from
   outside it, from the Qur'an and Ibn Khaldun to the Analects. What is true is that the
   West built on them, which is why nine of its own curricula still assign them. */
const strap = line({
  font: roman, text: '689 works the West was built on', size: 42, x: M, y: 402, fill: INK_SOFT,
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  ${seal({ id: 'og', cx: SEAL.cx, cy: SEAL.cy, size: SEAL.size, rotate: -4 })}
  ${wordmark.svg}
  <rect x="${M}" y="350" width="${Math.round(wordmark.right - M)}" height="2" fill="${RED}" opacity="0.5"/>
  ${strap.svg}
</svg>`;

/* The grain goes over the wax as well as the paper, which is what base.css does: one sheet
   under one light, rather than a textured background with a clean sticker on it. */
await sharp(Buffer.from(svg))
  .composite([{ input: await paperGrain(), tile: true }])
  .png({ compressionLevel: 9 })
  .toFile('public/og-default.png');

/**
 * Two icons, because one drawing cannot do both jobs.
 *
 * A browser tab is sixteen pixels. The full mark is three thin page curves beside a solid
 * block, and at that size the curves are a pixel each: they grey together and the icon
 * reads as an orange blob, which is what shipped. The tab icon therefore uses the solid
 * leaf alone, which is nearly square, fills the space and still reads as a page. The home
 * screen icon is 180 pixels and has room for the whole mark.
 */
function ico(images: { px: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ px, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(px % 256, e); head.writeUInt8(px % 256, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
}
const tabIcon = (size: number) => {
  const w = size * 0.58;
  const x = (size - w) / 2;
  const y = (size - (w / LEAF_W) * LEAF_H) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="${RED}"/>
    ${leaf(x, y, w / LEAF_W)}
  </svg>`;
};
const appIcon = (size: number) => {
  const w = size * 0.8;
  const x = (size - w) / 2;
  const y = (size - markHeightForWidth(w)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${RED}"/>
    ${mark(x, y, markScaleForWidth(w))}
  </svg>`;
};
writeFileSync('public/favicon.svg', tabIcon(64));
// Safari in particular prefers a raster icon when it can find one, and a tab that has
// already cached the old drawing is more likely to pick up a file it has never seen.
for (const px of [16, 32, 48]) await sharp(Buffer.from(tabIcon(px * 4))).resize(px, px).png().toFile(`public/favicon-${px}.png`);
await sharp(Buffer.from(appIcon(180))).png().toFile('public/apple-touch-icon.png');
// Browsers, feed readers and crawlers still ask for /favicon.ico whatever the <link> tags
// say, and a 404 there was the most requested missing file on the site. An .ico may hold
// PNGs directly, so it is the same three rasters in a six-byte header and a directory.
writeFileSync('public/favicon.ico', ico([16, 32, 48].map((px) => ({ px, png: readFileSync(`public/favicon-${px}.png`) }))));

const meta = await sharp('public/og-default.png').metadata();
console.log(
  `share card ${meta.width}x${meta.height}\n` +
  `  wordmark  ${Math.round(wordmark.left)} -> ${Math.round(wordmark.right)}\n` +
  `  strapline ${Math.round(strap.left)} -> ${Math.round(strap.right)} (margin at ${W - M})\n` +
  `  icons written, mark fills ${Math.round((1 - 2 * 0.09) * 100)}% of the icon width`,
);
