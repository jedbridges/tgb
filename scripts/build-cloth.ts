/**
 * Bookcloth.
 *
 *   npx tsx scripts/build-cloth.ts
 *
 * One seamless tile of woven cloth, for the works that have no jacket. Half the catalogue
 * is old enough that no publisher's cover exists for it, and a flat coloured panel with
 * type on it reads as a placeholder. A bound series does not: the Harvard Classics, Everyman,
 * Loeb and Britannica's own Great Books are all exactly this, a cloth board with the title
 * stamped into it, so it is the honest thing for this site to show rather than a costume.
 *
 * Three decisions.
 *
 * It is a real plain weave, not noise. Warp threads run down, weft threads run across, and
 * at each crossing one passes over the other, alternating like a chessboard. That single
 * rule is what the eye recognises as cloth; noise alone reads as dirt or as film grain. Each
 * thread also gets its own slight tone, because a dyed thread is never quite its neighbour's
 * colour, and that irregularity is most of what keeps it from looking printed.
 *
 * It carries light and dark in the alpha channel, like the paper grain, so it recolours by
 * sitting at low opacity over any tone. A single-colour tile could only darken or lighten
 * and would need a blend mode, and a blend mode on 689 covers forces the whole shelf into
 * one compositing group. This way one 64px tile serves every book in every colour and costs
 * nothing to composite.
 *
 * The weave is quiet on purpose. At the size a cover is actually seen, a strong weave turns
 * into moiré against the pixel grid; this is pitched so it reads as a surface rather than as
 * a pattern, and disappears entirely into the spine.
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const N = 64;          // tile edge, and a multiple of THREAD so the weave wraps cleanly
const THREAD = 2;      // thread width in pixels
const CELLS = N / THREAD;
const MAX_ALPHA = 30;  // out of 255, before the CSS opacity over the cloth colour

/** Deterministic: the same cloth on every machine and in every build. */
let seed = 0x2545f491;
const rand = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
};

// Every thread carries its own tone for the whole length of the tile, which is what dyed
// cloth does and what a per-pixel random never gives you.
const warpTone = Array.from({ length: CELLS }, () => rand() * 2 - 1);
const weftTone = Array.from({ length: CELLS }, () => rand() * 2 - 1);

const rgba = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const cx = Math.floor(x / THREAD);
    const cy = Math.floor(y / THREAD);
    // Plain weave: at alternating crossings the warp is on top, otherwise the weft is.
    const warpOver = (cx + cy) % 2 === 0;

    // Across its own width a thread is round, so it catches light in the middle and falls
    // away at the edges. That shading is the whole illusion of a woven surface.
    const acrossWarp = ((x % THREAD) + 0.5) / THREAD;
    const acrossWeft = ((y % THREAD) + 0.5) / THREAD;
    const round = Math.sin(Math.PI * (warpOver ? acrossWarp : acrossWeft));

    // The thread underneath sits in shadow where the other crosses it.
    const under = warpOver ? -0.35 : -0.35;
    const lift = warpOver ? round * 0.85 : round * 0.85;
    const tone = warpOver ? warpTone[cx] : weftTone[cy];

    let v = lift + under + tone * 0.28 + (rand() - 0.5) * 0.12;
    v = Math.max(-1, Math.min(1, v));

    const i = (y * N + x) * 4;
    const light = v >= 0 ? 255 : 0;
    rgba[i] = light; rgba[i + 1] = light; rgba[i + 2] = light;
    rgba[i + 3] = Math.round(Math.abs(v) * MAX_ALPHA);
  }
}

mkdirSync('public', { recursive: true });
const out = 'public/cloth.png';
await sharp(rgba, { raw: { width: N, height: N, channels: 4 } })
  .png({ compressionLevel: 9, palette: true })
  .toFile(out);

const meta = await sharp(out).metadata();
const alphas = [...rgba.filter((_, i) => i % 4 === 3)];
const mean = alphas.reduce((a, b) => a + b, 0) / alphas.length;
console.log(`${out}  ${meta.width}x${meta.height}  ${(meta.size! / 1024).toFixed(1)} KB`);
console.log(`  ${THREAD}px threads, ${CELLS}x${CELLS} weave, mean alpha ${mean.toFixed(1)}/255 (max ${MAX_ALPHA})`);
writeFileSync('.cache/cloth-note.txt', `tile ${N}px, thread ${THREAD}, max alpha ${MAX_ALPHA}\n`);
