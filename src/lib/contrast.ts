/**
 * Contrast arithmetic, used at build time to guarantee the lettering on a book is legible.
 *
 * A book's spine colour is sampled from the left edge of its real cover, so it can be any
 * colour at all: a pale linen, a mid olive, a near-black cloth. Picking the lettering by a
 * single luminance threshold, which is what this used to do, puts cream type on a mid tone
 * about as often as it puts it on a dark one. Measuring instead means every spine on the
 * site clears the same floor as the rest of the page.
 */

const SRGB = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const LIN = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** oklch -> linear sRGB, gamut-clipped per channel. */
function oklchToLinear(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp01(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp01(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** Accepts the two notations the content actually uses: #rrggbb and oklch(l c h). */
export function toLinear(color: string): [number, number, number] {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [LIN(((n >> 16) & 255) / 255), LIN(((n >> 8) & 255) / 255), LIN((n & 255) / 255)];
  }
  const ok = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(color);
  if (ok) {
    const l = ok[1].endsWith('%') ? parseFloat(ok[1]) / 100 : parseFloat(ok[1]);
    return oklchToLinear(l, parseFloat(ok[2]), parseFloat(ok[3]));
  }
  throw new Error(`contrast: cannot read the colour "${color}"`);
}

const luminance = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function contrast(a: string, b: string): number {
  const x = luminance(toLinear(a));
  const y = luminance(toLinear(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const toHex = (c: [number, number, number]) =>
  '#' + c.map((v) => Math.round(SRGB(v) * 255).toString(16).padStart(2, '0')).join('');

/** The two inks a printed spine actually uses: the site's own ink and its own paper. */
const DARK_INK = '#221d1b';
const LIGHT_INK = '#f4ece6';

export interface Legible { bg: string; ink: string; ratio: number }

/**
 * Returns a spine colour and a lettering colour that clear `floor` together.
 *
 * The lettering is chosen first, because changing it costs nothing. Only when neither ink
 * clears the floor against the sampled colour is the spine itself moved, and then only far
 * enough to get there: the search walks it toward whichever end already has more headroom,
 * in oklch so the hue and the warmth of the original survive the move.
 */
export function legibleSpine(bg: string, floor = 4.5): Legible {
  const dark = contrast(bg, DARK_INK);
  const light = contrast(bg, LIGHT_INK);
  const best = dark >= light ? DARK_INK : LIGHT_INK;
  const bestRatio = Math.max(dark, light);
  if (bestRatio >= floor) return { bg, ink: best, ratio: bestRatio };

  // Neither ink works, so the spine is a mid tone. Push it away from the ink we keep.
  const lin = toLinear(bg);
  const l0 = luminance(lin);
  const toward = best === DARK_INK ? 1 : 0; // lighten under dark type, darken under light
  let lo = 0;
  let hi = 1;
  let out = bg;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const moved: [number, number, number] = [
      clamp01(lin[0] + (toward - lin[0]) * t),
      clamp01(lin[1] + (toward - lin[1]) * t),
      clamp01(lin[2] + (toward - lin[2]) * t),
    ];
    const hex = toHex(moved);
    if (contrast(hex, best) >= floor) { out = hex; hi = t; } else { lo = t; }
  }
  void l0;
  return { bg: out, ink: best, ratio: contrast(out, best) };
}
