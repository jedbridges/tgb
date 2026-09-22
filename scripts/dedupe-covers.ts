/**
 * Several works legitimately share one edition: Hackett's Five Dialogues really does contain
 * Apology, Crito, Euthyphro, Meno and Phaedo. But a shared ISBN means a shared cover image,
 * and a shelf showing the same picture five times stops doing the one job a shelf has.
 *
 * So one work in each group keeps the photograph, and the rest fall back to the generated
 * typographic cover, which tells them apart. The keeper is the most widely assigned work,
 * since that is the page most people will land on.
 *
 *   npx tsx scripts/dedupe-covers.ts [--apply]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { parse } from 'yaml';
import { readPrograms } from './lib/programs';

/** The edition record we already fetched while verifying ISBNs. */
function editionTitle(isbn: string): string {
  const f = `.cache/openlibrary/https-openlibrary-org-isbn-${isbn}-json.json`;
  if (!existsSync(f)) return '';
  try {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    return [d?.title, d?.subtitle].filter(Boolean).join(' ');
  } catch { return ''; }
}
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the','a','an','of','and','or','to','in','on','by','with','selected','works','complete','other','writings','essays']);
const words = (t: string) => norm(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
/** How much of this work's title the edition's own title actually contains. */
function titleAffinity(workTitle: string, edTitle: string): number {
  const w = words(workTitle), e = words(edTitle);
  if (!w.length || !e.length) return 0;
  return w.filter((x) => e.includes(x)).length / w.length;
}

const APPLY = process.argv.includes('--apply');

const programCount = new Map<string, number>();
for (const p of readPrograms()) {
  const seen = new Set<string>();
  for (const seg of p.segments) for (const it of seg.items) seen.add(it.work);
  for (const slug of seen) programCount.set(slug, (programCount.get(slug) ?? 0) + 1);
}

interface Row { slug: string; isbn: string; title: string }
const rows: Row[] = [];
for (const f of readdirSync('src/content/works')) {
  if (!f.endsWith('.md')) continue;
  const slug = f.replace(/\.md$/, '');
  const m = readFileSync(`src/content/works/${f}`, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  const d = parse(m[1]);
  const isbn = d.cover?.isbn13 ?? d.recommendedEdition?.isbn13;
  if (isbn && d.cover?.source === 'openlibrary') rows.push({ slug, isbn, title: d.title });
}

const groups = new Map<string, Row[]>();
for (const r of rows) groups.set(r.isbn, [...(groups.get(r.isbn) ?? []), r]);

let demoted = 0, removedFiles = 0, groupCount = 0;
for (const [isbn, members] of groups) {
  if (members.length < 2) continue;
  groupCount++;
  const edTitle = editionTitle(isbn);
  const scored = members.map((m) => ({ ...m, aff: titleAffinity(m.title, edTitle), progs: programCount.get(m.slug) ?? 0 }));
  const leadPos = (t: string) => {
    const first = words(t)[0];
    const idx = first ? words(edTitle).indexOf(first) : -1;
    return idx === -1 ? 99 : idx;
  };
  const ranked = [...scored].sort(
    (a, b) => b.aff - a.aff || leadPos(a.title) - leadPos(b.title) || b.progs - a.progs || a.slug.localeCompare(b.slug),
  );
  // If the edition is an omnibus that names none of its contents, no single work owns the
  // photograph, so every member takes a generated cover and the shelf stays legible.
  const ownerExists = ranked[0].aff >= 0.5;
  const keeper = ownerExists ? ranked[0] : null;
  console.log(`${isbn} "${edTitle || 'unknown edition'}"`);
  console.log(keeper
    ? `   cover stays on ${keeper.slug} (title match ${Math.round(keeper.aff * 100)}%)`
    : `   no member owns this edition, all ${members.length} take generated covers`);
  for (const m of (keeper ? ranked.slice(1) : ranked)) {
    console.log(`   → ${m.slug} falls back to a generated cover`);
    if (!APPLY) continue;
    const file = `src/content/works/${m.slug}.md`;
    const src = readFileSync(file, 'utf8');
    const out = src.replace(
      /^cover:[ \t]*(?:\{[^}]*\}[ \t]*)?\n(?:[ \t]+\S.*\n)*/m,
      'cover: { source: generated }\n',
    );
    if (out !== src) { writeFileSync(file, out); demoted++; }
    const img = `src/assets/covers/${m.slug}.jpg`;
    if (existsSync(img)) { rmSync(img); removedFiles++; }
  }
}
console.log(`\n${groupCount} shared editions${APPLY ? ` · ${demoted} works demoted · ${removedFiles} duplicate images deleted` : ' · report only, pass --apply'}`);
