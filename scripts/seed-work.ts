/**
 * Builds the worklist of every work referenced by any program that has no file yet,
 * with author slugs, and the list of authors with no file. Writes JSON for batch authoring.
 *   npx tsx scripts/seed-work.ts            -> prints summary, writes content/worklist.json
 */
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { readPrograms, authorSlug } from './lib/programs';

const programs = readPrograms();
const works = new Map<string, { slug: string; title?: string; author?: string; authorSlug: string; programs: { program: string; segment: string; note?: string }[] }>();
for (const p of programs) for (const s of p.segments) for (const it of s.items) {
  const w = works.get(it.work) ?? { slug: it.work, title: it.title, author: it.author, authorSlug: authorSlug(it.author, it.work), programs: [] };
  w.title ??= it.title; w.author ??= it.author;
  w.programs.push({ program: p.id, segment: s.label, note: it.note });
  works.set(it.work, w);
}
const existingWorks = new Set(readdirSync('src/content/works').map((f) => f.replace(/\.md$/, '')));
const existingAuthors = new Set(readdirSync('src/content/authors').map((f) => f.replace(/\.md$/, '')));
const missing = [...works.values()].filter((w) => !existingWorks.has(w.slug)).sort((a, b) => b.programs.length - a.programs.length || a.slug.localeCompare(b.slug));
const authors = new Map<string, { slug: string; name: string; works: string[] }>();
for (const w of works.values()) {
  const a = authors.get(w.authorSlug) ?? { slug: w.authorSlug, name: w.author ?? w.authorSlug, works: [] };
  a.works.push(w.slug); authors.set(w.authorSlug, a);
}
const missingAuthors = [...authors.values()].filter((a) => !existingAuthors.has(a.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
// conflicts: same author slug, different names
const names = new Map<string, Set<string>>();
for (const w of works.values()) { const s = names.get(w.authorSlug) ?? new Set(); s.add(w.author ?? '?'); names.set(w.authorSlug, s); }
const conflicts = [...names].filter(([, s]) => s.size > 1);
writeFileSync('content/worklist.json', JSON.stringify({ works: missing, authors: missingAuthors }, null, 2));
console.log(`works: ${works.size} total, ${missing.length} missing files; authors: ${authors.size} total, ${missingAuthors.length} missing`);
if (conflicts.length) { console.log('author slug conflicts:'); for (const [s, n] of conflicts) console.log(`  ${s}: ${[...n].join(' | ')}`); }
