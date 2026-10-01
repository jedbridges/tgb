/**
 * The device and the legend, turned into a height map.
 *
 * These are the only sharp things on the seal, so they are the only things that arrive as
 * a texture; everything smooth is evaluated in the shader. Two channels: the relief
 * itself, softened by about three quarters of a unit because a die leaves a rounded
 * shoulder rather than a cut one, and the same mask blurred much wider, which the shader
 * subtracts to find the crevice around each raised letter.
 *
 * The paths are read out of the SVG that was already rendered into the page rather than
 * fetched again. That is a little unusual, and it is deliberate: it keeps the glyph
 * outlines out of the JavaScript bundle, and it makes "the fallback and the render agree"
 * true by construction rather than by inspection.
 */
import { FIELD_C, RELIEF_HALF } from './seal-geometry';

/** Blur radii, in viewBox units. The first is the die's shoulder, the second is how far
 *  a crevice reads as shadow. */
const SOFT_R = 0.9;
const AO_R = 4;

/**
 * A separable box blur, run twice, which is close enough to a Gaussian here.
 *
 * Not ctx.filter = 'blur()': Safari applies it inconsistently to paths drawn before it is
 * set, and this has to be identical in every browser or the relief changes depth between
 * them. A running sum is a few lines and is exactly predictable.
 */
function boxBlur(src: Uint8Array, w: number, h: number, radius: number, passes = 2): Uint8Array {
  if (radius < 1) return src;
  let a = src, b = new Uint8Array(src.length);
  const r = Math.round(radius);
  const span = r * 2 + 1;
  for (let pass = 0; pass < passes; pass++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = sum / span;
        sum -= a[row + Math.min(w - 1, Math.max(0, x - r))];
        sum += a[row + Math.min(w - 1, Math.max(0, x + r + 1))];
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / span;
        sum -= b[Math.min(h - 1, Math.max(0, y - r)) * w + x];
        sum += b[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
      }
    }
  }
  return a;
}

export interface Relief { data: Uint8Array; size: number; unitsPerTexel: number }

/**
 * Rasterise the relief group out of the page's own SVG.
 *
 * `svg` is the fallback that shipped in the HTML. Its relief group is already positioned
 * in viewBox units, so the only transform needed here is viewBox units to texels.
 */
export function buildRelief(svg: SVGSVGElement, cssSize: number, dprCap = 2): Relief | null {
  const group = svg.querySelector<SVGGElement>('#seal-relief');
  if (!group) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const span = RELIEF_HALF * 2;
  const size = Math.max(128, Math.min(1024, Math.round((cssSize * dpr * span) / 400)));
  const k = size / span;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // viewBox units to texels, with the box's own origin at the top left of the texture.
  ctx.setTransform(k, 0, 0, k, -(FIELD_C[0] - RELIEF_HALF) * k, -(FIELD_C[1] - RELIEF_HALF) * k);

  for (const node of Array.from(group.querySelectorAll<SVGGraphicsElement>('path, use'))) {
    // data-h is how high this element stands: the device full, the legend a shade lower,
    // so the mark reads as the deeper cut even where a letter crosses close to it.
    const level = Number(node.dataset.h ?? 255);
    ctx.fillStyle = `rgb(${level},${level},${level})`;

    let d: string | null = null;
    if (node.tagName === 'path') {
      d = node.getAttribute('d');
    } else {
      const href = node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? '';
      d = svg.querySelector(href)?.getAttribute('d') ?? null;
    }
    if (!d) continue;

    /* Every transform between this node and the relief root, outermost first. Walking the
       chain rather than reading one matrix is what lets the group hold the legend and the
       device as separate children with transforms of their own: the first version only
       read the node and its immediate parent, and the device, one level deeper, silently
       rasterised at the origin and vanished off the texture. */
    const chain: DOMMatrix[] = [];
    for (let n: Element | null = node; n && n !== group.parentElement; n = n.parentElement) {
      const m = (n as SVGGraphicsElement).transform?.baseVal.consolidate()?.matrix;
      if (m) chain.unshift(m);
      if (n === group) break;
    }
    ctx.save();
    for (const m of chain) ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    try { ctx.fill(new Path2D(d)); } catch { /* a path the browser will not parse is simply skipped */ }
    ctx.restore();
  }

  const raw = ctx.getImageData(0, 0, size, size).data;
  const mask = new Uint8Array(size * size);
  for (let i = 0, j = 0; i < raw.length; i += 4, j++) mask[j] = raw[i];

  const soft = boxBlur(Uint8Array.from(mask), size, size, SOFT_R * k);
  const wide = boxBlur(Uint8Array.from(mask), size, size, AO_R * k);

  // LUMINANCE_ALPHA: two bytes a texel, which is all WebGL1 offers for a two channel map
  // and exactly what is needed here.
  const out = new Uint8Array(size * size * 2);
  for (let i = 0; i < mask.length; i++) { out[i * 2] = soft[i]; out[i * 2 + 1] = wide[i]; }
  return { data: out, size, unitsPerTexel: span / size };
}
