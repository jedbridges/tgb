/** Series tones for generated (typographic) covers. Muted cloth-binding colours, cream ink. */
export const TONES = [
  { id: 'oxblood', bg: 'oklch(0.36 0.09 25)', ink: 'oklch(0.94 0.02 70)' },
  { id: 'forest', bg: 'oklch(0.36 0.06 150)', ink: 'oklch(0.94 0.02 90)' },
  { id: 'navy', bg: 'oklch(0.32 0.06 260)', ink: 'oklch(0.94 0.015 80)' },
  { id: 'ochre', bg: 'oklch(0.62 0.11 75)', ink: 'oklch(0.2 0.02 60)' },
  { id: 'slate', bg: 'oklch(0.42 0.02 240)', ink: 'oklch(0.95 0.01 80)' },
  { id: 'plum', bg: 'oklch(0.36 0.07 330)', ink: 'oklch(0.94 0.02 70)' },
  { id: 'bottle', bg: 'oklch(0.34 0.05 190)', ink: 'oklch(0.94 0.02 90)' },
  { id: 'tobacco', bg: 'oklch(0.45 0.07 55)', ink: 'oklch(0.95 0.02 80)' },
  { id: 'ink', bg: 'oklch(0.26 0.015 40)', ink: 'oklch(0.93 0.02 70)' },
  { id: 'sage', bg: 'oklch(0.6 0.05 130)', ink: 'oklch(0.2 0.02 100)' },
];
export function toneFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
