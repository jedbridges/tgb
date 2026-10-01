/**
 * The legend, turned into outlines once so nothing at runtime has to set type on a circle.
 *
 * Why this is a build step and not frontmatter. The seal's legend is half Latin and half
 * Greek, and neither font this site ships has a Greek capital in it: Gambetta has 354
 * glyphs and Satoshi 431, and none of them is a lambda. So the legend needs a third face,
 * and a third face the site does not serve is a face CI does not have, because .cache is
 * gitignored and the deploy runs `npm ci` on a clean checkout. Outlining it here and
 * committing the result means the build needs no font, the browser downloads no font, and
 * the letters cannot reflow when a webfont lands late.
 *
 * It also means the SVG fallback and the WebGL relief are drawing the same paths, because
 * the client reads these outlines back out of the rendered SVG rather than fetching them
 * again.
 *
 * Run it with `npm run seal`. It is deterministic: same font in, same JSON out, so a
 * rerun that produces a diff means something actually changed.
 *
 * The face is EB Garamond SemiBold (SIL OFL 1.1), from the upstream EBGaramond12 project.
 * SemiBold rather than Regular because the relief is two and a half units deep and a
 * Garamond hairline at that depth is not a stroke, it is a rumour.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import opentype, { type Font } from 'opentype.js';
import { pathData } from './lib/brand';
import * as G from '../src/lib/seal-geometry';
import { LEGEND } from '../src/lib/seal-geometry';
import { MARK_PATHS } from '../src/lib/mark';

const FONT = '.cache/fonts/EBGaramond-SemiBold.ttf';
const OUT = 'src/assets/seal-legend.json';
const CREDIT = 'EB Garamond SemiBold (SIL OFL 1.1)';

function loadFont(path: string): Font {
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}.\n` +
      'Download EB Garamond SemiBold (static TTF, SIL OFL) into .cache/fonts:\n' +
      '  curl -sL -o .cache/fonts/EBGaramond-SemiBold.ttf \\\n' +
      '    https://raw.githubusercontent.com/octaviopardo/EBGaramond12/master/fonts/ttf/EBGaramond-SemiBold.ttf',
    );
  }
  const font = opentype.parse(readFileSync(path).buffer.slice(0) as ArrayBuffer);
  /* A variable font would outline as its default instance and silently give the wrong
     weight, which is the kind of bug that only shows up as "the seal looks thin". */
  if (font.tables?.fvar) throw new Error(`${path} is a variable font. This needs a static instance.`);
  return font;
}

/** One repeat: the phrase, a gap, the Greek, a gap. The word is the separator; no dots. */
const unit = `${LEGEND.latin}${' '.repeat(1)}${LEGEND.greek} `;

interface Placed { ch: string; mid: number; adv: number }

/** Lay one repeat out on a straight line, in font units, with the font's own kerning. */
function layout(font: Font, upm: number, trackingEm: number): { glyphs: Placed[]; width: number } {
  const track = trackingEm * upm;
  const glyphs: Placed[] = [];
  let x = 0;
  font.forEachGlyph(unit, 0, 0, upm, { kerning: true }, (glyph, gx) => {
    const adv = glyph.advanceWidth ?? 0;
    // forEachGlyph reports the pen position before this glyph, kerning included. Tracking
    // is ours to add, and it accumulates, so the running index does the work.
    const at = gx + track * glyphs.length;
    glyphs.push({ ch: unit[glyphs.length] ?? '', mid: at + adv / 2, adv });
    x = at + adv;
  });
  return { glyphs, width: x + track * Math.max(0, glyphs.length - 1) - track * (glyphs.length - 1) + track };
}

function main() {
  const font = loadFont(FONT);
  const upm = font.unitsPerEm;
  const capHeight = font.tables?.os2?.sCapHeight ?? 650;

  for (const ch of new Set((LEGEND.latin + LEGEND.greek).replace(/ /g, ''))) {
    if (font.charToGlyphIndex(ch) <= 0) throw new Error(`${CREDIT} has no glyph for ${ch}`);
  }

  const C = 2 * Math.PI * LEGEND.baselineR;
  const repeats = 2;

  /* Solve size and tracking together. The natural width of a repeat fixes their product,
     so pick the tracking that puts the cap height where we want it, then let the size
     follow. One pass is enough because tracking moves the width linearly. */
  const natural = layout(font, upm, 0).width / upm; // in em
  const glyphCount = layout(font, upm, 0).glyphs.length;
  const size = (LEGEND.capTarget * upm) / capHeight;      // viewBox units per em
  const needEm = C / repeats / size;                       // em of advance each repeat must fill
  const trackingEm = (needEm - natural) / glyphCount;

  const cap = (capHeight * size) / upm;
  if (trackingEm < LEGEND.trackingRange[0] || trackingEm > LEGEND.trackingRange[1]) {
    throw new Error(
      `Tracking ${trackingEm.toFixed(4)}em is outside ${LEGEND.trackingRange.join(' to ')}em ` +
      `at ${repeats} repeats (cap ${cap.toFixed(2)} units). Change the repeat count or the baseline radius.`,
    );
  }
  if (cap < LEGEND.capRange[0] || cap > LEGEND.capRange[1]) {
    throw new Error(`Cap height ${cap.toFixed(2)} units is outside ${LEGEND.capRange.join(' to ')}.`);
  }

  const { glyphs } = layout(font, upm, trackingEm);
  const advance = needEm * upm; // font units per repeat, by construction exactly C/repeats

  /* Outline each distinct letter once. Fifty-eight placements share about seventeen
     shapes, so this is the difference between seven kilobytes and thirty. */
  const shapes: Record<string, string> = {};
  for (const ch of new Set(glyphs.map((g) => g.ch))) {
    if (ch === ' ') continue;
    const d = pathData(font.getPath(ch, 0, 0, upm) as unknown as { commands: Array<Record<string, number | string>> });
    if (/NaN|Infinity|undefined/.test(d)) throw new Error(`Malformed outline for ${JSON.stringify(ch)}`);
    shapes[ch] = d;
  }

  /* Put each glyph's midpoint on the circle and stand it up, which is what textPath does.
     The Greek lands at twelve o'clock: theta0 offsets the run so the first lambda, not the
     first I of IN, is the thing at the top. */
  const greekStart = unit.indexOf(LEGEND.greek);
  const greekMidEm = (glyphs[greekStart].mid + glyphs[greekStart + LEGEND.greek.length - 1].mid) / 2;
  /* Angles are a fraction of the whole ring, not of one repeat. Dividing by advance alone
     puts repeat two a full turn past repeat one, which is the same place: the first build
     drew both on top of each other and looked, convincingly, like a single repeat. */
  const ring = advance * repeats;
  const theta0 = -(greekMidEm / ring) * 2 * Math.PI;

  const k = size / upm;
  const place: Array<[string, string]> = [];
  for (let r = 0; r < repeats; r++) {
    for (const g of glyphs) {
      if (g.ch === ' ') continue;
      const s = (g.mid + r * advance) / ring; // 0..1 around the whole ring
      const th = -Math.PI / 2 + theta0 + s * 2 * Math.PI;
      const cx = LEGEND.baselineR * Math.cos(th), cy = LEGEND.baselineR * Math.sin(th);
      // rotate(theta + 90deg) so the glyph's up points outward from the centre
      const a = th + Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // M = translate(c) * rotate(a) * scale(k) * translate(-adv/2, 0)
      const e = cx + (ca * -(g.adv / 2)) * k;
      const f = cy + (sa * -(g.adv / 2)) * k;
      const n = (v: number) => (Math.round(v * 1e4) / 1e4).toString();
      place.push([g.ch, `matrix(${n(ca * k)} ${n(sa * k)} ${n(-sa * k)} ${n(ca * k)} ${n(e)} ${n(f)})`]);
    }
  }

  const json = {
    font: CREDIT,
    note: 'Generated by scripts/build-seal.ts. Outlines in font units, y down. Placements are relative to FIELD_C.',
    upm, size: Math.round(size * 1e4) / 1e4, tracking: Math.round(trackingEm * 1e4) / 1e4,
    repeats, baselineR: LEGEND.baselineR, cap: Math.round(cap * 100) / 100,
    glyphs: shapes, place,
  };
  writeFileSync(OUT, JSON.stringify(json, null, 1) + '\n');

  console.log(`${CREDIT}`);
  console.log(`  repeats ${repeats}  size ${size.toFixed(2)}u/em  tracking ${trackingEm.toFixed(4)}em  cap ${cap.toFixed(2)}u`);
  console.log(`  ${Object.keys(shapes).length} shapes, ${place.length} placements`);
  console.log(`  cap top reaches ${(LEGEND.baselineR + cap).toFixed(1)}u, field wall at 120u`);
  console.log(`  wrote ${OUT} (${(JSON.stringify(json).length / 1024).toFixed(1)} KB)`);

  /* --proof writes a flat diagram of the geometry: no shading, no shader, just where
     everything sits. It is the cheapest way to judge a pour and to see the legend close,
     and it answers the question the renderer cannot, which is whether the drawing is
     right before any light is put on it. */
  if (process.argv.includes('--proof')) {
    const defs = Object.entries(shapes)
      .map(([ch, d]) => `<path id="g${ch.codePointAt(0)}" d="${d}"/>`).join('');
    const uses = place
      .map(([ch, m]) => `<use href="#g${ch.codePointAt(0)}" transform="${m}"/>`).join('');
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800">`,
      `<defs>${defs}</defs>`,
      `<rect width="400" height="400" fill="#f2e8e4"/>`,
      `<path d="${G.outlinePath()}" fill="#8c2f1a"/>`,
      `<circle cx="${G.FIELD_C[0]}" cy="${G.FIELD_C[1]}" r="${G.R_LIP}" fill="none" stroke="#0000001f" stroke-width="11"/>`,
      `<circle cx="${G.FIELD_C[0]}" cy="${G.FIELD_C[1]}" r="${G.R_FIELD}" fill="#73251400"/>`,
      `<circle cx="${G.FIELD_C[0]}" cy="${G.FIELD_C[1]}" r="${G.R_FIELD}" fill="#732514"/>`,
      `<g transform="translate(${G.FIELD_C[0]},${G.FIELD_C[1]})" fill="#e3b49c">${uses}</g>`,
      `<g transform="${G.DEVICE_TRANSFORM}" fill="#e3b49c">${MARK_PATHS.map((d) => `<path d="${d}"/>`).join('')}</g>`,
      // Guides, so the eye can check what the numbers claim: the baseline the legend sits
      // on, and the vertical through the centre the Greek should straddle.
      `<circle cx="${G.FIELD_C[0]}" cy="${G.FIELD_C[1]}" r="${LEGEND.baselineR}" fill="none" stroke="#00a0ff55" stroke-width="0.4"/>`,
      `<line x1="${G.FIELD_C[0]}" y1="0" x2="${G.FIELD_C[0]}" y2="400" stroke="#00a0ff55" stroke-width="0.4"/>`,
      `</svg>`,
    ].join('');
    writeFileSync('.cache/seal-proof.svg', svg);
    console.log('  wrote .cache/seal-proof.svg');
  }
}

main();
