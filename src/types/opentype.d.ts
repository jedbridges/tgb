/* opentype.js ships no types. Only the calls this project's scripts make are declared:
   build-og.ts sets lines of type, build-seal.ts walks glyphs and checks coverage. */
declare module 'opentype.js' {
  interface BoundingBox { x1: number; y1: number; x2: number; y2: number }
  interface Path {
    getBoundingBox(): BoundingBox;
    toPathData(decimalPlaces?: number): string;
  }
  export interface Glyph {
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
    getBoundingBox(): BoundingBox;
  }
  export interface Font {
    unitsPerEm: number;
    /* Only the tables this project reads. fvar is checked for presence alone: a variable
       font outlines as its default instance, which is the wrong weight without saying so. */
    tables?: { fvar?: unknown; os2?: { sCapHeight?: number } };
    getPath(
      text: string, x: number, y: number, fontSize: number,
      options?: { letterSpacing?: number; kerning?: boolean },
    ): Path;
    charToGlyphIndex(ch: string): number;
    charToGlyph(ch: string): Glyph;
    forEachGlyph(
      text: string, x: number, y: number, fontSize: number,
      options: { kerning?: boolean; letterSpacing?: number },
      callback: (glyph: Glyph, x: number, y: number, fontSize: number) => void,
    ): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const _default: { parse: typeof parse };
  export default _default;
}
