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
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { RED, CREAM, mark, markScaleForWidth, markHeightForWidth, loadFonts, setText, measure } from './lib/brand.ts';

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

/* ---------------------------------------------------------------- write */

const jobs: [string, string][] = [
  [`${OUT}/avatar-180.png`, avatar(180)],
  [`${OUT}/avatar-512.png`, avatar(512)],          // a spare for anywhere that wants more
  [`${OUT}/banner-2048x600.png`, banner(2048, 600)],
];
for (const [file, svg] of jobs) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
  const m = await sharp(file).metadata();
  console.log(`${file.padEnd(34)} ${m.width}x${m.height}`);
}
