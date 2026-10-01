import type { APIRoute } from 'astro';
import { loadFreeReads } from '~/lib/free';
import { getCollection } from 'astro:content';
import { loadCatalog, placeholderAuthor, sortedByAssignment, difficultyLabel, lengthLabel, yearShort } from '~/lib/catalog';
import { abs, workUrl } from '~/lib/url';

/**
 * llms-full.txt: the site's own writing that a model can read whole in one request. The
 * shelf notes and program descriptions in full (about 30,000 words), then a one line index
 * of every work with its URL, so a model that has read this file can cite the right page.
 * The guides themselves are on their pages and in the corpus export, not here: 1.2 million
 * words is not a file to fetch.
 */
export const GET: APIRoute = async () => {
  const { works, authors, programs } = await loadCatalog();
  const [themes, eras, genres, difficulties, lengths, notes] = await Promise.all([
    getCollection('themes'), getCollection('eras'), getCollection('genres'), getCollection('difficulties'), getCollection('lengths'), getCollection('shelfNotes'),
  ]);
  const label = new Map<string, string>();
  for (const [kind, list] of [['themes', themes], ['eras', eras], ['genres', genres], ['difficulties', difficulties], ['lengths', lengths]] as const) for (const e of list) label.set(`${kind}-${e.id}`, e.data.label);
  const urlFor = (kind: string, id: string) => kind === 'difficulties' ? abs(`/books/difficulty/${id}/`) : kind === 'lengths' ? abs(`/books/length/${id}/`) : abs(`/${kind}/${id}/`);
  const title = (w: (typeof works)[number]) => `${w.data.title}, ${(authors.get(w.data.author.id) ?? placeholderAuthor(w.data.author.id)).data.name}`;

  const out: string[] = ['# The Great Books: shelves, programs and the index of works', '', `Generated from ${abs('/')}. The reading guide for each work is on its own page.`, ''];
  const kinds: [string, string][] = [['themes', 'Themes'], ['eras', 'Eras'], ['genres', 'Forms'], ['difficulties', 'By difficulty'], ['lengths', 'By length']];
  for (const [kind, heading] of kinds) {
    out.push(`## ${heading}`, '');
    for (const n of notes.filter((n) => n.data.kind === kind).sort((a, b) => (label.get(a.id) ?? '').localeCompare(label.get(b.id) ?? ''))) {
      out.push(`### ${label.get(n.id) ?? n.data.shelf}`, '', `Source: ${urlFor(kind, n.data.shelf)}`, '');
      if (n.data.startHere) { const w = works.find((x) => x.id === n.data.startHere!.id); if (w) out.push(`Start here: ${title(w)} (${abs(workUrl(w.id))})${n.data.startHereNote ? `. ${n.data.startHereNote}` : ''}`, ''); }
      if (n.data.pairing) { const ws = n.data.pairing.works.map((r) => works.find((x) => x.id === r.id)).filter(Boolean); if (ws.length === 2) out.push(`Read together: ${title(ws[0]!)} and ${title(ws[1]!)}. ${n.data.pairing.note}`, ''); }
      out.push(n.body?.trim() ?? '', '');
    }
  }
  out.push('## Programs', '');
  for (const p of programs) {
    out.push(`### ${p.data.name}`, '', `Source: ${abs(`/programs/${p.id}/`)}`, '', p.data.description.trim(), '');
    for (const s of [...p.data.segments].sort((a, b) => a.order - b.order)) {
      out.push(`#### ${s.label}${s.sublabel ? ` (${s.sublabel})` : ''}`, '');
      if (s.description) out.push(s.description, '');
      out.push(s.items.map((it) => `- ${it.title ?? it.work.id}${it.author ? `, ${it.author}` : ''}`).join('\n'), '');
    }
  }
  out.push('## Index of works', '', 'Title, author, date, difficulty, length, number of the nine lists that assign it, URL, the translation or edition we recommend, and where to read it free when it is out of copyright.', '');
  const { assigned } = await loadCatalog();
  const free = await loadFreeReads();
  for (const w of await sortedByAssignment(works)) {
    const n = new Set((assigned.get(w.id) ?? []).map((a) => a.program.id)).size;
    const ed = w.data.recommendedEdition;
    const pick = ed && (ed.translator ? `${ed.translator} translation` : ed.editor ? `${ed.editor} edition` : ed.publisher ? `${ed.publisher} edition` : '');
    const f = free.get(w.id);
    const freeNote = f ? `; free: ${f.edition}, ${f.external ? f.url : abs(f.url)}` : '';
    out.push(`- ${title(w)}, ${yearShort(w)}, ${difficultyLabel(w.data.difficulty)}, ${lengthLabel[w.data.length]}, ${n} of 9, ${abs(workUrl(w.id))}${pick ? `; recommended: ${pick}` : ''}${freeNote}`);
  }
  out.push('');
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
