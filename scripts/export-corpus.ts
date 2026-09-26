/**
 * Export the site's own writing as a corpus for retrieval: one Markdown file per document
 * under corpus/, each with a header a chunker can carry into a citation (url, title, kind,
 * author, themes). This is the input for phase three of docs/search-plan.md, where the
 * folder is synced to an R2 bucket for Cloudflare AI Search; it is also a plain dump anyone
 * can grep.
 *
 *   npx tsx scripts/export-corpus.ts            everything
 *   npx tsx scripts/export-corpus.ts --stats    counts and sizes only
 *
 * Only text the site wrote or is free to redistribute goes in: the guides, the author bios,
 * the shelf notes, the program descriptions and the public domain texts. Nothing from a
 * copyrighted edition, and no boilerplate a model would otherwise cite.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const OUT = 'corpus';
const SITE = (process.env.SITE_URL || 'https://greatbookslist.com').replace(/\/$/, '');
const STATS = process.argv.includes('--stats');

const fm = (file: string) => {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { data: parse(m[1]) as Record<string, any>, body: m[2].trim() } : null;
};
const mdFiles = (dir: string, deep = false): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (deep ? mdFiles(join(dir, e.name), true) : []) : e.name.endsWith('.md') ? [join(dir, e.name)] : []) : [];
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

interface Doc { path: string; header: Record<string, string | string[] | number>; body: string }
const docs: Doc[] = [];
const header = (h: Doc['header']) => '---\n' + Object.entries(h).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}: ${Array.isArray(v) ? JSON.stringify(v) : JSON.stringify(String(v))}`).join('\n') + '\n---\n';

const authors = new Map(mdFiles('src/content/authors').map((f) => [f.replace(/^.*\//, '').replace(/\.md$/, ''), fm(f)!]));
const taxonomy = (k: string) => new Map((parse(readFileSync(`src/content/taxonomies/${k}.yaml`, 'utf8')) as any[]).map((t) => [t.id, t.label as string]));
const themes = taxonomy('themes'), eras = taxonomy('eras'), genres = taxonomy('genres');

/* Guides: the synopsis, why it matters, key themes with their notes, the body, and the
   highlights with their notes. The facts a chunk needs to be cited well are in the header. */
for (const f of mdFiles('src/content/works')) {
  const w = fm(f); if (!w) continue;
  const slug = f.replace(/^.*\//, '').replace(/\.md$/, '');
  const d = w.data;
  const author = authors.get(d.author)?.data.name ?? d.author;
  const parts: string[] = [`# ${d.title}`, `by ${author}${d.yearDisplay ? `, ${d.yearDisplay}` : ''}`, '', d.synopsis];
  if (d.whyItMatters) parts.push('', '## Why it is on the lists', '', d.whyItMatters);
  if (d.keyThemes?.length) parts.push('', '## Key themes', '', ...d.keyThemes.map((k: any) => `- ${themes.get(k.theme) ?? k.theme}: ${k.note}`));
  if (w.body) parts.push('', w.body);
  if (d.highlights?.length) parts.push('', '## Passages', '', ...d.highlights.map((h: any) => `> ${h.text}\n>\n> ${[h.location, h.translator && `trans. ${h.translator}`].filter(Boolean).join(', ')}${h.note ? `\n\n${h.note}` : ''}`));
  docs.push({
    path: `guides/${slug}.md`,
    header: { url: `${SITE}/books/${slug}/`, kind: 'guide', title: d.title, author, year: d.yearDisplay ?? String(d.year), era: eras.get(d.era) ?? d.era, form: genres.get(d.genre) ?? d.genre, difficulty: d.difficulty, length: d.length, themes: (d.themes ?? []).map((t: string) => themes.get(t) ?? t) },
    body: parts.join('\n'),
  });
}

for (const [slug, a] of authors) {
  if (!a.body || a.body.length < 40) continue;
  docs.push({ path: `authors/${slug}.md`, header: { url: `${SITE}/authors/${slug}/`, kind: 'author', title: a.data.name }, body: `# ${a.data.name}\n\n${a.body}` });
}

for (const f of mdFiles('src/content/shelf-notes')) {
  const n = fm(f); if (!n) continue;
  const { kind, shelf } = n.data;
  const label = (kind === 'themes' ? themes : kind === 'eras' ? eras : kind === 'genres' ? genres : null)?.get(shelf) ?? shelf;
  const url = kind === 'difficulties' ? `${SITE}/books/difficulty/${shelf}/` : kind === 'lengths' ? `${SITE}/books/length/${shelf}/` : `${SITE}/${kind}/${shelf}/`;
  docs.push({ path: `shelves/${kind}-${shelf}.md`, header: { url, kind: 'shelf', title: label }, body: `# ${label}\n\n${n.body}` });
}

for (const f of readdirSync('src/content/programs').filter((f) => f.endsWith('.yaml'))) {
  const p = parse(readFileSync(`src/content/programs/${f}`, 'utf8'));
  const slug = f.replace(/\.yaml$/, '');
  const segs = [...p.segments].sort((a: any, b: any) => a.order - b.order).map((s: any) => `## ${s.label}${s.sublabel ? ` (${s.sublabel})` : ''}\n\n${s.description ?? ''}\n\n${s.items.map((it: any) => `- ${it.title ?? it.work}${it.author ? `, ${it.author}` : ''}`).join('\n')}`);
  docs.push({ path: `programs/${slug}.md`, header: { url: `${SITE}/programs/${slug}/`, kind: 'program', title: p.name }, body: `# ${p.name}\n\n${p.description}\n\n${segs.join('\n\n')}` });
}

for (const f of mdFiles('src/content/texts', true)) {
  const t = fm(f); if (!t) continue;
  const d = t.data;
  const work = fm(`src/content/works/${d.work}.md`)?.data;
  docs.push({
    path: `texts/${d.work}/${d.section}.md`,
    header: { url: `${SITE}/books/${d.work}/text/${d.section}/`, kind: 'passage', title: `${work?.title ?? d.work}: ${d.heading}`, book: work?.title ?? d.work, author: authors.get(work?.author)?.data.name ?? '', edition: d.edition, translator: d.translator ?? '' },
    body: `# ${work?.title ?? d.work}: ${d.heading}\n\n${t.body}`,
  });
}

const byKind = new Map<string, { n: number; words: number }>();
for (const doc of docs) { const k = String(doc.header.kind); const e = byKind.get(k) ?? { n: 0, words: 0 }; e.n++; e.words += words(doc.body); byKind.set(k, e); }
for (const [k, e] of byKind) console.log(`${k.padEnd(8)} ${String(e.n).padStart(5)} docs ${e.words.toLocaleString().padStart(10)} words`);
console.log(`${'total'.padEnd(8)} ${String(docs.length).padStart(5)} docs ${[...byKind.values()].reduce((n, e) => n + e.words, 0).toLocaleString().padStart(10)} words`);
if (STATS) process.exit(0);

rmSync(OUT, { recursive: true, force: true });
for (const doc of docs) {
  const file = join(OUT, doc.path);
  mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(file, header(doc.header) + doc.body + '\n');
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ site: SITE, exported: new Date().toISOString(), documents: docs.map((d) => ({ path: d.path, url: d.header.url, kind: d.header.kind, title: d.header.title })) }, null, 1));
console.log(`written to ${OUT}/`);
