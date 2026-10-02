/**
 * The brand, as the build scripts need it: the mark, the two colours, and the machinery
 * for setting type in the site's own face.
 *
 * This exists because there were three reds on this project at one point, one of them
 * living only inside a build script, and the share card had drifted away from the site it
 * was advertising. Anything generated as an image now reads its red and its lettering from
 * one file.
 */
import { readFileSync, existsSync } from 'node:fs';
import opentype, { type Font } from 'opentype.js';
import sharp from 'sharp';

/**
 * oklch to a hex sRGB string, the conversion a browser performs for `color: oklch(...)`.
 *
 * Most of this project's tokens are written in oklch, and sharp renders SVG through
 * librsvg, which predates the syntax and silently drops any fill it cannot parse. Resolving
 * them here is what lets a generated image quote a token instead of a second hand copy of
 * one, which is the drift this file exists to stop.
 */
export function oklch(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return '#' + [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  }).join('');
}

/** --accent, resolved in the light scheme. The one red. */
export const RED = '#b62200';
/** --paper-bright, the cream that sits on it. */
export const CREAM = '#f4ece6';
/** --paper, the page itself, which is what wax is actually struck on. */
export const PAPER = '#f2e8e4';
/** --ink-strong and --ink-soft, the two weights of text the page sets. */
export const INK_STRONG = oklch(0.31, 0.014, 40);
export const INK_SOFT = oklch(0.46, 0.015, 40);

/**
 * The page's own grain, as a tile to lay over a finished image.
 *
 * base.css puts public/paper.png over the whole site at 192px and 13% opacity, above the
 * content rather than behind it, so everything on the page sits under the same tooth. An
 * image generated without it is the only flat surface the brand has. The alpha is scaled
 * here rather than drawn at full strength and faded by the compositor, because sharp's
 * tiling composite has no opacity of its own.
 *
 * Returns the tile, to be composited with `{ input: await paperGrain(), tile: true }`.
 */
export async function paperGrain(opacity = 0.13): Promise<Buffer> {
  const { data, info } = await sharp('public/paper.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/* The mark itself lives in src/lib/mark.ts, which imports nothing, so the seal can have it
   on both sides of the build. Re-exported here because this file is the brand's front door
   for scripts. */
import { MARK_PATHS, MARK_W, MARK_H } from '../../src/lib/mark';
export { MARK_W, MARK_H };

/**
 * The mark reduced to its solid leaf, for sizes where the rest cannot survive.
 *
 * The full mark is three thin page curves beside one solid block. Scaled into a sixteen
 * pixel browser tab the curves are about a pixel each with a pixel between them, so they
 * grey together into a smudge and the whole thing reads as an orange blob. The block alone
 * is nearly square, fills the icon, and still reads as a page.
 */
export const LEAF_W = 800;
export const LEAF_H = 965.685;
export function leaf(x: number, y: number, scale: number, fill = CREAM): string {
  return `<g transform="translate(${x},${y}) scale(${scale})" fill="${fill}"><path d="${MARK_PATHS[3]}"/></g>`;
}

/** The mark as an SVG group, placed and scaled. */
export function mark(x: number, y: number, scale: number, fill = CREAM, opacity = 1): string {
  return `<g transform="translate(${x},${y}) scale(${scale})" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}>`
    + MARK_PATHS.map((d) => `<path d="${d}"/>`).join('')
    + '</g>';
}

/** Scale the mark to a given width, and the height that follows. */
export const markScaleForWidth = (w: number) => w / MARK_W;
export const markHeightForWidth = (w: number) => (w / MARK_W) * MARK_H;

const FONTS = {
  roman: '.cache/fonts/Gambetta-400.ttf',
  italic: '.cache/fonts/Gambetta-400i.ttf',
} as const;

export function loadFonts(): { roman: Font; italic: Font } {
  for (const p of Object.values(FONTS)) {
    if (!existsSync(p)) throw new Error(`Missing ${p}. The static TTFs live in .cache/fonts.`);
  }
  const parse = (p: string) => opentype.parse(readFileSync(p).buffer.slice(0) as ArrayBuffer);
  return { roman: parse(FONTS.roman), italic: parse(FONTS.italic) };
}

/**
 * opentype.js 2.0.0 emits NaN from toPathData() for these outlines even though every
 * command it produced is sound, and librsvg stops drawing a path at the first coordinate
 * it cannot read: that is how a share card once shipped reading "689 works · n". The
 * commands are serialised here instead, and checked before they can reach the canvas.
 */
export function pathData(path: { commands: Array<Record<string, number | string>> }): string {
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

export interface SetText {
  font: Font; text: string; size: number; x: number; y: number;
  letterSpacing?: number; opacity?: number; fill?: string;
}
export interface SetResult { svg: string; left: number; right: number; width: number }

/** Outline one line of type and report where it actually sits, so it can be placed. */
export function setText(
  { font, text, size, x, y, letterSpacing = 0, opacity = 1, fill = CREAM }: SetText,
): SetResult {
  const path = font.getPath(text, x, y, size, { letterSpacing: letterSpacing / size });
  const { x1, x2 } = path.getBoundingBox();
  const d = pathData(path as unknown as { commands: Array<Record<string, number | string>> });
  if (/NaN|Infinity|undefined/.test(d)) throw new Error(`Malformed outline for ${JSON.stringify(text)}`);
  return {
    svg: `<path d="${d}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`,
    left: x1, right: x2, width: x2 - x1,
  };
}

/** Measure a line without drawing it, which is what centring needs. */
export const measure = (font: Font, text: string, size: number, letterSpacing = 0) => {
  const { x1, x2 } = font.getPath(text, 0, 0, size, { letterSpacing: letterSpacing / size }).getBoundingBox();
  return { left: x1, right: x2, width: x2 - x1 };
};
