/**
 * The 2019 mark, on a 1681.625 x 965.685 artboard. Four leaves reading as an open spread.
 *
 * These four strings were living in three places at once: Logo.astro, Seal.astro and
 * scripts/lib/brand.ts, which is three chances for the mark to drift from itself. They
 * live here now because the seal needs them on both sides of the build, in a module that
 * imports nothing: no node builtins, so a browser bundle can have it, and no astro:assets,
 * so a script can.
 */
export const MARK_W = 1681.625;
export const MARK_H = 965.685;

export const MARK_PATHS = [
  'M1681.625,391.685c-220.914-220.913-579.086-220.913-800,0v-226c220.914-220.913,579.086-220.913,800,0Z',
  'M1681.625,965.685c-220.914-220.914-579.086-220.914-800,0v-226c220.914-220.914,579.086-220.914,800,0Z',
  'M1681.625,678.685c-220.914-220.914-579.086-220.914-800,0v-226c220.914-220.914,579.086-220.914,800,0Z',
  'M800,965.685c-220.914-220.914-579.086-220.914-800,0v-800c220.914-220.913,579.086-220.913,800,0Z',
] as const;
