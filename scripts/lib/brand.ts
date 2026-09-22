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

/** --accent, resolved in the light scheme. The one red. */
export const RED = '#b62200';
/** --paper-bright, the cream that sits on it. */
export const CREAM = '#f4ece6';

/** The 2019 mark, on a 1681.625 x 965.685 artboard. Four leaves reading as an open spread. */
export const MARK_W = 1681.625;
export const MARK_H = 965.685;
const MARK_PATHS = [
  'M1681.625,391.685c-220.914-220.913-579.086-220.913-800,0v-226c220.914-220.913,579.086-220.913,800,0Z',
  'M1681.625,965.685c-220.914-220.914-579.086-220.914-800,0v-226c220.914-220.914,579.086-220.914,800,0Z',
  'M1681.625,678.685c-220.914-220.914-579.086-220.914-800,0v-226c220.914-220.914,579.086-220.914,800,0Z',
  'M800,965.685c-220.914-220.914-579.086-220.914-800,0v-800c220.914-220.913,579.086-220.913,800,0Z',
];

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
