/**
 * The shape of the wax, in one place.
 *
 * Three things draw this seal and they must agree exactly: the server-rendered SVG that
 * ships in the HTML, the WebGL shader that replaces it, and the build script that lays the
 * legend around it. Agreement is not a matter of care here, it is a matter of arithmetic,
 * so all three read their numbers from this file and the shader gets its constants from
 * glslConstants() rather than from a second copy written by hand.
 *
 * Everything is in units of the 400 x 400 viewBox, y down, which is the frame the old seal
 * used and the frame the mark is already placed in.
 *
 * The one rule: this module imports nothing but the mark. No DOM, no node builtins. It is
 * bundled for the browser and imported by a build script, and it has to suit both.
 */
import { MARK_W, MARK_H } from './mark';

/* The pour.
   Changing this changes the shape of the wax and nothing else: the die, the legend and the
   mark are rigid and sit where they are told. 689 is the number of works, which is as good
   a seed as any and better than a number nobody can explain. */
export const SEED = 689;

/** Centre of the pool, and of the viewBox. */
export const P: readonly [number, number] = [200, 200];

/* mulberry32. Small, fast, and the same everywhere, which is the only property that
   matters: the SVG and the shader must get the same pour, and so must the next build. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The outline.
 *
 * A circle, plus six harmonics, plus three lobes where the wax ran further than it did
 * elsewhere. Molten wax dropped on paper is round because of surface tension and irregular
 * because of how it fell, which is exactly a low-frequency perturbation of a circle with a
 * few local bulges, so that is what this is rather than hand-drawn noise.
 *
 * Harmonics are stored pre-multiplied as vectors H_k, so that
 *
 *     a_k * cos(k*theta + phi_k) = dot(z^k, H_k)
 *
 * where z^k is the kth complex power of the unit direction. That matters for two reasons:
 * the shader never has to call atan, which is slow and, worse, discontinuous at the back of
 * the circle, which would leave a visible seam straight down the left edge of the wax.
 */
const R0 = 158;
const HARMONIC_A = [0.030, 0.022, 0.016, 0.010, 0.007, 0.005]; // k = 2..7
const LOBE_KAPPA = 18; // von Mises concentration: a bump about 0.24rad wide

export interface Lobe { dir: readonly [number, number]; amp: number }

function build() {
  const r = rng(SEED);
  /* Each harmonic gets a seeded phase and a seeded share of its amplitude. The share is
     never below 0.7, because a harmonic that rounds to nothing leaves the outline looking
     machined rather than poured. */
  const H: Array<readonly [number, number]> = HARMONIC_A.map((a) => {
    const phi = r() * Math.PI * 2;
    const amp = a * R0 * (0.7 + 0.3 * r());
    return [amp * Math.cos(phi), -amp * Math.sin(phi)] as const;
  });

  /* Three lobes, kept at least 70 degrees apart so they read as separate runs of wax
     rather than as one lopsided side. Rejection sampling, which terminates quickly for
     three directions on a circle and is clearer than solving it. */
  const lobes: Lobe[] = [];
  let guard = 0;
  while (lobes.length < 3 && guard++ < 500) {
    const t = r() * Math.PI * 2;
    const dir = [Math.cos(t), Math.sin(t)] as const;
    if (lobes.some((l) => l.dir[0] * dir[0] + l.dir[1] * dir[1] > Math.cos((70 * Math.PI) / 180))) continue;
    lobes.push({ dir, amp: 5.5 + 2.5 * r() });
  }
  return { H, lobes };
}

const { H, lobes } = build();
export const HARMONICS = H;
export const LOBES = lobes;

/** Radius of the wax at a unit direction. The same function the shader runs. */
export function outlineRadius(ux: number, uy: number): number {
  // Complex powers: z^1 = u, then z^(k+1) = z^k * u.
  let zx = ux, zy = uy;
  let rad = R0;
  for (let k = 0; k < HARMONICS.length; k++) {
    // z^(k+2): advance twice on the first step, once thereafter.
    const times = k === 0 ? 2 : 1;
    for (let t = 0; t < times; t++) {
      const nx = zx * ux - zy * uy;
      zy = zx * uy + zy * ux;
      zx = nx;
    }
    rad += zx * HARMONICS[k][0] + zy * HARMONICS[k][1];
  }
  for (const l of LOBES) {
    const d = ux * l.dir[0] + uy * l.dir[1];
    rad += l.amp * Math.exp(LOBE_KAPPA * (d - 1));
  }
  return rad;
}

/** Signed distance to the wax edge, positive inside. Radial rather than true normal
 *  distance, which at these frequencies differs by well under a unit. */
export function sdWax(x: number, y: number): number {
  const dx = x - P[0], dy = y - P[1];
  const len = Math.hypot(dx, dy) || 1e-6;
  return outlineRadius(dx / len, dy / len) - len;
}

function extent() {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 2048; i++) {
    const t = (i / 2048) * Math.PI * 2;
    const v = outlineRadius(Math.cos(t), Math.sin(t));
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}
const EXT = extent();
export const R_MIN = EXT.lo;
export const R_MAX = EXT.hi;

/* The die.
 *
 * Rigid metal, so these are true circles with no noise at all. The contrast between a
 * ragged pour and a perfectly round strike is most of what makes the thing read as wax
 * rather than as a blob. */

/** Struck a little off centre, the way a hand does it. */
export const FIELD_C: readonly [number, number] = [P[0] + 2.4, P[1] - 1.6];
/** The recessed field the die pressed flat. */
export const R_FIELD = 120;
/** How far the wall of the field is softened. A die has a rounded shoulder. */
export const FIELD_WALL = 2.5;
/** The die face was not quite level: about 0.6 units of fall across the field. */
export const FIELD_TILT: readonly [number, number] = [0.004, 0.003];
/** Crest of the lip squeezed out around the die. */
export const R_LIP = 128;
export const LIP_SIGMA = 5.5;
/** Width of the meniscus where the pool meets the paper. */
export const W_EDGE = 16;

/* Heights, in the same units as everything else, so a slope is a slope. */
export const H_POOL = 9;      // thickness of the pool away from the edge
export const H_LIP = 3.5;     // crest of the squeeze, before its own unevenness
export const H_FLOOR = 4;     // floor of the struck field: about 8.5 below the lip
/* The device and legend above the floor. Deep for a real seal, which is the point: at
   2.6 the lettering was legible and nearly flat, and the whole thing read as a printed
   disc rather than a struck one. The shoulder blur in seal-relief keeps it from looking
   stamped out of tin. */
export const H_RELIEF = 3.6;

/* The squeeze is uneven, because the wax under the die had somewhere different to go on
   each side. Three low harmonics with seeded phases, same idea as the outline. */
const lipR = rng(SEED ^ 0x9e3779b9);
export const LIP_WOBBLE: Array<readonly [number, number]> = [0.25, 0.15, 0.10].map((b) => {
  const phi = lipR() * Math.PI * 2;
  return [b * Math.cos(phi), -b * Math.sin(phi)] as const;
});

/* The legend.
 *
 * baselineR and capTarget are what the build script solves against. The ring has to close
 * exactly, so the script picks a size and a tracking that make n whole repeats fit the
 * circumference, and refuses anything outside these bounds rather than quietly setting the
 * legend too small or too loose. */
export const LEGEND = {
  baselineR: 100,
  /* Cap height drives everything else: the legend has to fill the ring exactly, so asking
     for taller letters asks for tighter tracking, and at 11.5 units it goes negative and
     the letters start to crash. 10 leaves 0.08em, which is the open letterspacing a struck
     legend wants anyway, and keeps 10 units between the cap tops and the field wall. */
  capTarget: 10,
  capRange: [9, 12.5] as const,
  /* Not a style preference, a breakage guard: below zero the letters touch, and much above
     0.16 the words stop reading as words. */
  trackingRange: [0.02, 0.16] as const,
  latin: 'IN PRINCIPIO ERAT VERBUM',
  greek: 'ΛΟΓΟΣ',
  /** Space either side of the Greek, in em. No dots: the word is the separator. */
  gapEm: 0.6,
} as const;

/* The device, centred in the field. The mark's mass sits high in its own box, so it is
   nudged down a little to look centred rather than measure centred. */
export const DEVICE_SCALE = 0.078;
export const DEVICE_NUDGE_Y = 2;
export const DEVICE_W = MARK_W * DEVICE_SCALE;
export const DEVICE_H = MARK_H * DEVICE_SCALE;
export const DEVICE_TRANSFORM =
  `translate(${(FIELD_C[0] - DEVICE_W / 2).toFixed(2)},${(FIELD_C[1] - DEVICE_H / 2 + DEVICE_NUDGE_Y).toFixed(2)}) scale(${DEVICE_SCALE})`;

/** The square the relief texture has to cover: the field and its wall, nothing else. */
export const RELIEF_HALF = 124;

const f = (v: number) => (Math.round(v * 1e4) / 1e4).toFixed(4);

/**
 * A closed outline, as cubic segments.
 *
 * Catmull-Rom through evenly spaced samples, converted to beziers. Sampling the radius
 * directly as a polygon needs hundreds of points to stop the straight edges showing on a
 * 400 unit disc; ninety-six smoothed samples is about three and a half kilobytes and has
 * no flat spots.
 */
export function outlinePath(samples = 96): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const ux = Math.cos(t), uy = Math.sin(t);
    const rad = outlineRadius(ux, uy);
    pts.push([P[0] + rad * ux, P[1] + rad * uy]);
  }
  const at = (i: number) => pts[(i + samples) % samples];
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < samples; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

/**
 * The same numbers again, as GLSL.
 *
 * The shader could hold its own copy of all of this, and then one of the two would be
 * edited alone. It takes them from here instead, which costs a string concatenation at
 * module scope and removes the whole class of bug.
 */
export function glslConstants(): string {
  const v2 = (a: readonly [number, number]) => `vec2(${f(a[0])},${f(a[1])})`;
  return [
    `const float R0 = ${f(R0)};`,
    `const vec2 P = ${v2(P)};`,
    ...HARMONICS.map((h, i) => `const vec2 H${i + 2} = ${v2(h)};`),
    ...LOBES.map((l, i) => `const vec3 LOBE${i} = vec3(${f(l.dir[0])},${f(l.dir[1])},${f(l.amp)});`),
    `const float LOBE_KAPPA = ${f(LOBE_KAPPA)};`,
    `const vec2 FIELD_C = ${v2(FIELD_C)};`,
    `const float R_FIELD = ${f(R_FIELD)};`,
    `const float FIELD_WALL = ${f(FIELD_WALL)};`,
    `const vec2 FIELD_TILT = ${v2(FIELD_TILT)};`,
    `const float R_LIP = ${f(R_LIP)};`,
    `const float LIP_SIGMA = ${f(LIP_SIGMA)};`,
    `const float W_EDGE = ${f(W_EDGE)};`,
    `const float H_POOL = ${f(H_POOL)};`,
    `const float H_LIP = ${f(H_LIP)};`,
    `const float H_FLOOR = ${f(H_FLOOR)};`,
    `const float H_RELIEF = ${f(H_RELIEF)};`,
    ...LIP_WOBBLE.map((w, i) => `const vec2 LIPW${i + 1} = ${v2(w)};`),
    `const float R_MAX = ${f(R_MAX)};`,
    `const float RELIEF_HALF = ${f(RELIEF_HALF)};`,
  ].join('\n');
}
