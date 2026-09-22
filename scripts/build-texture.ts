/**
 * The paper grain.
 *
 * A tileable, seamless, bidirectional noise tile, for laying over the whole page at very
 * low opacity so the site reads as something printed rather than something lit.
 *
 * Three decisions worth knowing:
 *
 * It is blue noise, not white noise. White noise clumps: scatter random values and they
 * form visible blotches at exactly the frequency the eye is best at noticing, which reads
 * as dirt rather than as paper. Blue noise has the same randomness with the low
 * frequencies removed, so the grain is even everywhere. It is made here by high-passing
 * white noise, subtracting a blurred copy of itself, which is the cheap way to the same
 * place. The blur wraps around the edges, so the tile is seamless.
 *
 * It carries both dark and light grain, in the alpha channel. A tile of one colour can
 * only darken or only lighten, so it needs a blend mode to work in both schemes and blend
 * modes force the whole page into one compositing group. Giving the tile black specks and
 * white specks instead means plain opacity works, on parchment and in the dark, with no
 * blending at all.
 *
 * It is dithered to a small palette on purpose. Grain quantised to a few alpha steps has
 * the bite of something screened onto a page; smooth gaussian grain just looks like video
 * noise. That is the "dither" in the brief and it is the part that sells the effect.
 *
 *   npx tsx scripts/build-texture.ts
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const N = 192;            // tile edge. Big enough that repetition is invisible, small enough to stay tiny.
const BLUR = 2;           // radius of the low-pass that gets subtracted
const LEVELS = 4;         // alpha steps. Few enough to read as screened, many enough not to band.
const MAX_ALPHA = 46;     // out of 255, before the CSS opacity on top of it

/** Deterministic, so the texture is identical on every machine and in every build. */
let seed = 0x9e3779b9;
const rand = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
};

const at = (a: Float64Array, x: number, y: number) => a[((y + N) % N) * N + ((x + N) % N)];

// 1. White noise.
const white = new Float64Array(N * N);
for (let i = 0; i < N * N; i++) white[i] = rand();

// 2. Low-pass it, wrapping at the edges so the tile joins itself seamlessly.
const blurred = new Float64Array(N * N);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let sum = 0, n = 0;
    for (let dy = -BLUR; dy <= BLUR; dy++) {
      for (let dx = -BLUR; dx <= BLUR; dx++) { sum += at(white, x + dx, y + dy); n++; }
    }
    blurred[y * N + x] = sum / n;
  }
}

// 3. High-pass: what is left is the fine detail, evenly spread. That is the blue noise.
const high = new Float64Array(N * N);
let lo = Infinity, hi = -Infinity;
for (let i = 0; i < N * N; i++) {
  high[i] = white[i] - blurred[i];
  if (high[i] < lo) lo = high[i];
  if (high[i] > hi) hi = high[i];
}

// 4. Quantise to a few steps and write it as black and white specks in the alpha channel.
const rgba = Buffer.alloc(N * N * 4);
for (let i = 0; i < N * N; i++) {
  const v = (high[i] - lo) / (hi - lo) * 2 - 1;        // -1 .. 1
  const step = Math.round(Math.abs(v) * LEVELS) / LEVELS;
  const alpha = Math.round(step * MAX_ALPHA);
  const tone = v >= 0 ? 255 : 0;                        // lighten or darken this pixel
  rgba[i * 4] = tone; rgba[i * 4 + 1] = tone; rgba[i * 4 + 2] = tone; rgba[i * 4 + 3] = alpha;
}

const out = 'public/paper.png';
await sharp(rgba, { raw: { width: N, height: N, channels: 4 } })
  .png({ compressionLevel: 9, palette: true })
  .toFile(out);

const meta = await sharp(out).metadata();
const nonZero = rgba.filter((_, i) => i % 4 === 3).filter((a) => a > 0).length;
console.log(`${out}  ${meta.width}x${meta.height}  ${(meta.size! / 1024).toFixed(1)} KB`);
console.log(`  ${Math.round(nonZero / (N * N) * 100)}% of pixels carry grain, at most ${MAX_ALPHA}/255 alpha`);
writeFileSync('.cache/texture-note.txt', `tile ${N}px, blur ${BLUR}, ${LEVELS} levels, max alpha ${MAX_ALPHA}\n`);
