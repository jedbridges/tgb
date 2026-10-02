/**
 * The wax seal, as a still life for the images built on this machine.
 *
 * The site draws the seal three ways already: a shader, an SVG fallback, and the relief
 * rasterised out of that SVG. This is a fourth surface and deliberately not a fourth
 * drawing. Every radius and coefficient still comes from src/lib/seal-geometry.ts, the
 * legend still comes from the outlines build-seal.ts baked, and the device is the same
 * MARK_PATHS the header uses, so the seal on a share card is the seal on the page.
 *
 * Two things had to be translated rather than imported.
 *
 * The colours are tokens in oklch, and sharp renders SVG through librsvg, which predates
 * that syntax and would drop every fill it does not understand. brand.ts resolves them to
 * the same sRGB the browser computes, so a seal rendered to PNG is the colour a reader
 * sees in the page.
 *
 * The legend is drawn as 52 flat paths rather than 17 defs and a run of <use>. The glyphs
 * repeat around the ring and reusing them is the right call in a document a browser will
 * parse once; in a rasteriser invoked from a build script it only adds a way for two
 * instances on one canvas to collide over an id.
 */
import { oklch } from './brand';
import legend from '../../src/assets/seal-legend.json' with { type: 'json' };
import { MARK_PATHS } from '../../src/lib/mark';
import { outlinePath, FIELD_C, R_FIELD, R_LIP, DEVICE_TRANSFORM } from '../../src/lib/seal-geometry';

/* ------------------------------------------------------------------ colour */

/* The wax tokens from Seal.astro's light scheme. The dark half of those tokens is not used
   here: an image is its own object with its own light, and a share card has no colour
   scheme to follow. */
export const WAX = oklch(0.42, 0.17, 35);
export const WAX_DEEP = oklch(0.3, 0.13, 31);
export const WAX_EDGE = oklch(0.55, 0.19, 39);
/* color-mix(in oklab, var(--wax-edge), white 8%), which is a straight interpolation
   towards white in oklab: the lightness rises, the chroma falls off by the same share. */
export const WAX_DEVICE = oklch(0.55 * 0.92 + 0.08, 0.19 * 0.92, 39);
/* ------------------------------------------------------------------ drawing */

const OUTLINE = outlinePath();
const glyphs = legend.glyphs as Record<string, string>;
const place = legend.place as Array<[string, string]>;

export interface SealOptions {
  /** Distinguishes this instance's gradient ids from any other seal on the same canvas. */
  id: string;
  /** Where the seal's centre lands on the canvas. */
  cx: number;
  cy: number;
  /** Width and height of the whole wax, in canvas units. The art is square. */
  size: number;
  /** Degrees, about the centre. A struck seal is never quite square to the page. */
  rotate?: number;
  /** Off for a seal on its own ground, where a cast shadow would invent a light the page does not have. */
  shadow?: boolean;
}

/**
 * The seal as a self-contained fragment: its own gradients, its own transform, nothing
 * required of the document around it beyond being an SVG.
 */
export function seal({ id, cx, cy, size, rotate = 0, shadow = true }: SealOptions): string {
  const k = size / 400;
  const g = (n: string) => `${id}-${n}`;
  const legendPaths = place
    .map(([ch, m]) => (glyphs[ch] ? `<path d="${glyphs[ch]}" transform="${m}"/>` : ''))
    .join('');
  const device = MARK_PATHS.map((d) => `<path d="${d}"/>`).join('');

  return `<g transform="translate(${cx} ${cy}) scale(${k}) rotate(${rotate}) translate(-200 -200)">
    <defs>
      <radialGradient id="${g('body')}" cx="42%" cy="38%" r="72%">
        <stop offset="0" stop-color="${WAX_EDGE}"/>
        <stop offset="0.55" stop-color="${WAX}"/>
        <stop offset="1" stop-color="${WAX_DEEP}"/>
      </radialGradient>
      <radialGradient id="${g('shadow')}" cx="50%" cy="50%" r="50%">
        <stop offset="0.86" stop-color="rgb(20 12 8)" stop-opacity="0.22"/>
        <stop offset="0.98" stop-color="rgb(20 12 8)" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${g('lip')}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${WAX_EDGE}" stop-opacity="0.7"/>
        <stop offset="0.5" stop-color="${WAX}" stop-opacity="0"/>
        <stop offset="1" stop-color="${WAX_DEEP}" stop-opacity="0.6"/>
      </linearGradient>
      <linearGradient id="${g('field')}" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stop-color="${WAX_DEEP}"/>
        <stop offset="1" stop-color="${WAX}"/>
      </linearGradient>
      <!-- A recess lit from over the left shoulder has its near wall in shade and its far
           wall catching the light, which is the whole of what tells an eye it is sunk. -->
      <linearGradient id="${g('wall')}" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="${WAX_DEEP}"/>
        <stop offset="1" stop-color="${WAX_EDGE}"/>
      </linearGradient>
    </defs>
    ${shadow ? `<path d="${OUTLINE}" transform="translate(5 8) scale(1.04)" fill="url(#${g('shadow')})"/>` : ''}
    <path d="${OUTLINE}" fill="url(#${g('body')})"/>
    <circle cx="${FIELD_C[0]}" cy="${FIELD_C[1]}" r="${R_LIP}" fill="none" stroke="url(#${g('lip')})" stroke-width="11"/>
    <circle cx="${FIELD_C[0]}" cy="${FIELD_C[1]}" r="${R_FIELD}" fill="url(#${g('field')})"/>
    <circle cx="${FIELD_C[0]}" cy="${FIELD_C[1]}" r="${R_FIELD - 1.2}" fill="none" stroke="url(#${g('wall')})" stroke-width="2.4"/>
    <g fill="${WAX_EDGE}" transform="translate(${FIELD_C[0]} ${FIELD_C[1]})">${legendPaths}</g>
    <g fill="${WAX_DEVICE}" transform="${DEVICE_TRANSFORM}">${device}</g>
  </g>`;
}
