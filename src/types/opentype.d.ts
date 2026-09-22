/* opentype.js ships no types. Only the calls scripts/build-og.ts makes are declared. */
declare module 'opentype.js' {
  interface BoundingBox { x1: number; y1: number; x2: number; y2: number }
  interface Path {
    getBoundingBox(): BoundingBox;
    toPathData(decimalPlaces?: number): string;
  }
  export interface Font {
    getPath(
      text: string, x: number, y: number, fontSize: number,
      options?: { letterSpacing?: number; kerning?: boolean },
    ): Path;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const _default: { parse: typeof parse };
  export default _default;
}
