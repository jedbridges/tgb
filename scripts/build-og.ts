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

const RED = '#b62200';       // the site's one accent, --accent resolved in the light scheme
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

/**
 * opentype.js 2.0.0 emits NaN from toPathData() for these outlines even though every
 * command it produced is sound, and librsvg stops drawing a path at the first coordinate
 * it cannot read. That is why the card shipped reading "689 works · n": the line was not
 * too long, it was cut at the first unparseable number. The commands are serialised here
 * instead, and the result is checked before it can reach the canvas.
 */
function pathData(path: { commands: Array<Record<string, number | string>> }): string {
  const n = (v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Bad coordinate: ${String(v)}`);
    return String(Math.round(v * 100) / 100);
  };
  const out: string[] = [];
  for (const c of path.commands) {
    switch (c.type) {
      case 'M': out.push(`M${n(c.x)} ${n(c.y)}`); break;
      case 'L': out.push(`L${n(c.x)} ${n(c.y)}`); break;
      case 'C': out.push(`C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`); break;
      case 'Q': out.push(`Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`); break;
      case 'Z': out.push('Z'); break;
      default: throw new Error(`Unknown path command: ${String(c.type)}`);
    }
  }
  return out.join('');
}

/** Outline one line and report its measured width, so the caller can centre or rule to it. */
function line({ font, text, size, x, y, letterSpacing = 0, opacity = 1 }: Line) {
  const path = font.getPath(text, x, y, size, { letterSpacing: letterSpacing / size });
  const { x1, x2 } = path.getBoundingBox();
  const d = pathData(path as unknown as { commands: Array<Record<string, number | string>> });
  // A line that silently loses its tail is the failure this card already shipped once.
  if (/NaN|Infinity|undefined/.test(d)) throw new Error(`Malformed outline for ${JSON.stringify(text)}`);
  if (x2 > W - M) throw new Error(`"${text}" runs to ${Math.round(x2)}, past the ${W - M} margin`);
  return { svg: `<path d="${d}" fill="${CREAM}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`, left: x1, right: x2 };
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
/* "works that defined the West" would not be true of this list: 55 of the 689 come from
   outside it, from the Qur'an and Ibn Khaldun to the Analects. What is true is that the
   West built on them, which is why nine of its own curricula still assign them. */
const strap = line({
  font: roman, text: '689 works the West was built on', size: 42, x: M, y: 454, opacity: 0.88,
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

/**
 * The mark is 1.74 times wider than it is tall, so fitting it inside a square with even
 * padding left it filling barely half the width: at the sixteen pixels a browser tab
 * actually shows, the three page curves dissolved into a smear. It now runs almost the
 * full width and is centred on the height, which is the only way the open spread survives
 * at that size.
 */
const icon = (size: number) => {
  const pad = size * 0.09;
  const scale = (size - 2 * pad) / 1681.625;
  const y = (size - 965.685 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${RED}"/>
    ${MARK(pad, y, scale)}
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
