/** Editorial validation beyond the zod schema. Exit 1 on failure. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { readPrograms } from './lib/programs';

let errors = 0, warnings = 0;
const err = (m: string) => { console.error(`✗ ${m}`); errors++; };
const warn = (m: string) => { console.warn(`· ${m}`); warnings++; };

const fm = (file: string) => {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  return { data: parse(m[1]) as Record<string, any>, body: m[2] };
};
const works = new Map<string, { data: Record<string, any>; body: string }>();
for (const f of readdirSync('src/content/works')) if (f.endsWith('.md')) { const p = fm(`src/content/works/${f}`); if (p) works.set(f.replace(/\.md$/, ''), p); else err(`bad frontmatter: ${f}`); }
const authors = new Set(readdirSync('src/content/authors').filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));
const programs = readPrograms();

// programs -> works
const referenced = new Set<string>();
for (const p of programs) {
  const seen = new Set<string>();
  for (const s of p.segments) for (const it of s.items) {
    referenced.add(it.work);
    if (seen.has(it.work)) warn(`${p.id}: ${it.work} listed twice`); seen.add(it.work);
    if (!works.has(it.work)) err(`${p.id}: references missing work ${it.work}`);
  }
}
for (const slug of works.keys()) if (!referenced.has(slug)) warn(`work ${slug} is in no program`);

// works
const BANNED = /\b(timeless|masterpiece|delve|tapestry|in conclusion|testament to|rich tapestry)\b/i;
const REQUIRED_H = ['## Overview', '## How to read it', '## Questions it raises'];
for (const [slug, { data, body }] of works) {
  if (!authors.has(data.author)) err(`${slug}: author ${data.author} has no file`);
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const st = data.status ?? 'stub';
  if (st !== 'stub') {
    if (words < 550) err(`${slug}: status ${st} but body is ${words} words`);
    for (const h of REQUIRED_H) if (!body.includes(h)) err(`${slug}: missing "${h}"`);
    if (!/## (What happens|The argument)/.test(body)) err(`${slug}: missing "## What happens" or "## The argument"`);
    if (!data.whyItMatters) err(`${slug}: ${st} requires whyItMatters`);
    if ((data.highlights ?? []).length < 2) err(`${slug}: ${st} requires at least 2 highlights`);
    if ((data.keyThemes ?? []).length < 2) err(`${slug}: ${st} requires at least 2 keyThemes`);
  }
  if (st === 'published' || st === 'reviewed') {
    if (!data.recommendedEdition?.isbn13) err(`${slug}: ${st} requires recommendedEdition.isbn13`);
  }
  const text = `${data.synopsis ?? ''} ${data.whyItMatters ?? ''} ${body}`;
  const b = text.match(BANNED); if (b) warn(`${slug}: banned phrase "${b[0]}"`);
  if (/—/.test(text)) err(`${slug}: contains an em dash`);
  for (const h of data.highlights ?? []) {
    const modern = !['english', 'middle-english'].includes(data.language) && !h.translator && !/paraphrase/i.test(h.note ?? '');
    if (modern) warn(`${slug}: highlight without translator or paraphrase note`);
  }
  if (slug.split('-')[0] !== data.author.split('-')[0] && !['bible', 'anonymous', 'various'].includes(data.author)) warn(`${slug}: author ${data.author} does not match slug prefix`);
}
// 12-gram duplication across works (templated sameness)
const grams = new Map<string, string>();
for (const [slug, { body }] of works) {
  const w = body.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const local = new Set<string>();
  for (let i = 0; i + 12 <= w.length; i++) { const g = w.slice(i, i + 12).join(' '); if (local.has(g)) continue; local.add(g); const o = grams.get(g); if (o && o !== slug) { err(`${slug} shares a 12-word run with ${o}: "${g}"`); break; } grams.set(g, slug); }
}
console.log(`${works.size} works, ${authors.size} authors, ${programs.length} programs · ${errors} errors, ${warnings} warnings`);
if (errors) process.exit(1);
