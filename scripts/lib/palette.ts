/**
 * One colour per book, taken from its own cover.
 *
 * The site has exactly one accent and that is not negotiable, so this colour never touches
 * a button, a link or a piece of type. It is only ever used as light: a wash on the wall
 * behind a cover, the warmth in a cast shadow, the browser chrome on a phone. Light can be
 * any colour without the brand moving.
 *
 * Three decisions worth knowing.
 *
 * It buckets by hue, not by frequency. The most *common* colour on a jacket is almost
 * always its paper or its black, which would give six hundred grey books. What we want is
 * the colour someone would name if you asked them about the cover, so pixels are weighted
 * by chroma as well as count and the near-neutral ones are dropped before anything is
 * counted at all.
 *
 * It works in oklch. Averaging colours in sRGB drags everything toward mud, because the
 * space is not perceptually uniform; a red and a blue average to grey rather than to
 * purple. In oklch the hue survives the averaging, which is the only part we actually keep.
 *
 * It refuses. A near-black Odyssey, a pale sage Rousseau and every brand-coloured generated
 * cover have no colour worth borrowing, and tinting them anyway produces a grey glow that
 * reads as a rendering fault. Those return null, and the page simply does not tint.
 */
import sharp from 'sharp';

export interface Tint { l: number; c: number; h: number }
export interface Palette { tint: Tint; tint2?: Tint; chroma: number }

const LIN = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function rgbToOklch(r8: number, g8: number, b8: number): Tint {
  const r = LIN(r8 / 255), g = LIN(g8 / 255), b = LIN(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: Math.hypot(A, B), h };
}

/* Below this a pixel carries no hue anybody could name, so it votes for nothing. */
const NEUTRAL = 0.035;
/* And below this mean, the whole cover is a greyscale photograph or a brand-coloured
   fallback, and there is nothing here worth putting on a page. */
const TOO_GREY = 0.026;
const BUCKETS = 24;

/** The mean of an angular quantity, which is not the mean of its numbers. */
function meanHue(hues: number[], weights: number[]): number {
  let x = 0, y = 0;
  hues.forEach((h, i) => { const r = (h * Math.PI) / 180; x += Math.cos(r) * weights[i]; y += Math.sin(r) * weights[i]; });
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

export async function coverPalette(file: string): Promise<Palette | null> {
  // Small enough to be fast over seven hundred files, large enough that a spine stripe or a
  // publisher's logo cannot carry a vote on its own.
  const { data, info } = await sharp(file).resize(56, 84, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;

  const bins: { hues: number[]; ws: number[]; ls: number[]; cs: number[] }[] =
    Array.from({ length: BUCKETS }, () => ({ hues: [], ws: [], ls: [], cs: [] }));
  let chromaSum = 0;

  for (let i = 0; i < px; i++) {
    const { l, c, h } = rgbToOklch(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    chromaSum += c;
    if (c < NEUTRAL) continue;
    // Very dark and very light pixels carry a hue that is mostly noise, and a jacket's
    // white type would otherwise outvote its field.
    if (l < 0.14 || l > 0.94) continue;
    const b = bins[Math.floor(h / (360 / BUCKETS)) % BUCKETS];
    b.hues.push(h); b.ws.push(c); b.ls.push(l); b.cs.push(c);
  }

  const chroma = chromaSum / px;
  if (chroma < TOO_GREY) return null;

  const score = bins.map((b) => b.ws.reduce((a, w) => a + w, 0));
  const rank = score.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  if (!rank.length || rank[0][0] <= 0) return null;

  const read = (i: number): Tint => {
    const b = bins[i];
    const w = b.ws.reduce((a, v) => a + v, 0);
    const l = b.ls.reduce((a, v, k) => a + v * b.ws[k], 0) / w;
    const c = b.cs.reduce((a, v, k) => a + v * b.ws[k], 0) / w;
    return {
      l: Number(l.toFixed(3)),
      // Capped. A fully saturated jacket red used at full chroma as a wash stops being
      // light and becomes a coloured rectangle.
      c: Number(Math.min(c, 0.17).toFixed(3)),
      h: Number(meanHue(b.hues, b.ws).toFixed(1)),
    };
  };

  const tint = read(rank[0][1]);
  // A second colour only when it is genuinely a different one and genuinely present.
  const far = rank.slice(1).find(([s, i]) => {
    const d = Math.abs(((i - rank[0][1] + BUCKETS / 2 + BUCKETS) % BUCKETS) - BUCKETS / 2);
    return d >= 3 && s > rank[0][0] * 0.35;
  });

  return { tint, tint2: far ? read(far[1]) : undefined, chroma: Number(chroma.toFixed(4)) };
}
