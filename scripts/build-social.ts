/**
 * The profile and banner images for an outside profile, currently the Bookshop.org shop.
 *
 * Drawn from the same mark, red and lettering as the site and the share card, so a reader
 * who arrives at the shop from a link recognises where they came from.
 *
 *   npx tsx scripts/build-social.ts
 *
 * Two shapes, and the difference between them is the whole design:
 *
 * The avatar is shown as a circle. A mark 1.74 times wider than it is tall has very little
 * room inside a circle, so it takes only the width that stays clear of the crop, and the
 * wordmark is left off entirely: at 180 pixels "The Great Books" is a smudge, and a mark
 * that reads is worth more than a name that does not.
 *
 * The banner is centred rather than set to the left like every page on the site. A banner
 * is cropped from the sides by whatever is displaying it, and a left-aligned lockup is the
 * first thing lost. This is the one surface where the site's own alignment rule is the
 * wrong answer.
 *
 * The newsletter avatar is a third shape and takes neither answer. It is the seal, whole,
 * on paper, and it is the only one of the three that carries no lettering at all: it is
 * read at thirty-two pixels in a mail app's message list, where a wordmark is a grey bar
 * and even the seal's own legend is a texture. What survives that size is a red disc with
 * a book in it, which is exactly what the page shows a reader who arrives later.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { RED, CREAM, PAPER, paperGrain, mark, markScaleForWidth, markHeightForWidth, loadFonts, setText, measure } from './lib/brand.ts';
import { seal } from './lib/seal-art.ts';

const { roman, italic } = loadFonts();
const OUT = 'public/brand';
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- avatar, 180 square */

function avatar(size: number): string {
  // Inside the circle the mark keeps to 62% of the width, which leaves the leaves clear of
  // the crop at every angle rather than only at the horizontal.
  const w = size * 0.62;
  const x = (size - w) / 2;
  const y = (size - markHeightForWidth(w)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${RED}"/>
    ${mark(x, y, markScaleForWidth(w))}
  </svg>`;
}

/* ---------------------------------------------------------------- banner, 2048 x 600 */

function banner(W: number, H: number): string {
  const wordSize = Math.round(H * 0.26);        // 156 at 600 tall
  const strapSize = Math.round(H * 0.058);      // 35
  const word = measure(italic, 'The Great Books', wordSize);
  const strapText = '689 works the West was built on';
  const strap = measure(roman, strapText, strapSize, 0.02 * strapSize);

  const markW = Math.round(H * 0.15);
  const markH = markHeightForWidth(markW);
  const gapAfterMark = H * 0.075;
  const ruleGap = H * 0.055;
  const gapAfterRule = H * 0.075;

  // The block is measured, then centred as one thing, so the optical centre is the lockup
  // rather than any single line of it.
  const blockH = markH + gapAfterMark + wordSize + ruleGap + 2 + gapAfterRule + strapSize;
  const top = (H - blockH) / 2;

  const markX = (W - markW) / 2;
  const wordBaseline = top + markH + gapAfterMark + wordSize;
  const wordX = (W - word.width) / 2 - word.left;
  const ruleY = wordBaseline + ruleGap;
  const ruleW = Math.round(word.width * 1.02);
  const strapBaseline = ruleY + 2 + gapAfterRule + strapSize;
  const strapX = (W - strap.width) / 2 - strap.left;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${RED}"/>
    ${mark(W - markW * 3.2, H - markH * 2.4, markScaleForWidth(markW * 4), CREAM, 0.07)}
    ${mark(markX, top, markScaleForWidth(markW))}
    ${setText({ font: italic, text: 'The Great Books', size: wordSize, x: wordX, y: wordBaseline }).svg}
    <rect x="${(W - ruleW) / 2}" y="${ruleY}" width="${ruleW}" height="2" fill="${CREAM}" opacity="0.4"/>
    ${setText({ font: roman, text: strapText, size: strapSize, x: strapX, y: strapBaseline, letterSpacing: 0.02 * strapSize, opacity: 0.88 }).svg}
  </svg>`;
}

/* ------------------------------------------------- newsletter avatar, square */

/*
 * The wax keeps to 90% of the square: enough margin that a circular crop cannot shave the
 * uneven rim into a perfect arc, which is the one thing that says wax rather than button,
 * and no more than that. At 82% the ring of bare paper was a tenth of a thirty-two pixel
 * avatar spent on nothing, and the inbox is the size this image is actually read at.
 */
function sealAvatar(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${PAPER}"/>
    ${seal({ id: 'av', cx: size / 2, cy: size / 2, size: size * 0.9, rotate: -4 })}
  </svg>`;
}

/* ---------------------------------------------------------------- write */

const jobs: [string, string, boolean][] = [
  [`${OUT}/avatar-180.png`, avatar(180), false],
  [`${OUT}/avatar-512.png`, avatar(512), false],          // a spare for anywhere that wants more
  [`${OUT}/banner-2048x600.png`, banner(2048, 600), false],
  // Buttondown asks for 300 square and takes larger; the 600 is the one to upload, and the
  // 300 is there for anywhere that takes the dimension literally.
  [`${OUT}/newsletter-avatar-600.png`, sealAvatar(600), true],
  [`${OUT}/newsletter-avatar-300.png`, sealAvatar(300), true],
];
const grain = await paperGrain();
for (const [file, svg, grained] of jobs) {
  const img = sharp(Buffer.from(svg));
  // Only the paper surfaces take the page's tooth. The red ones are ink, not sheet.
  if (grained) img.composite([{ input: grain, tile: true }]);
  await img.png({ compressionLevel: 9 }).toFile(file);
  const m = await sharp(file).metadata();
  console.log(`${file.padEnd(40)} ${m.width}x${m.height}`);
}
