import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { loadCatalog, hasGuide } from '~/lib/catalog';
import { abs } from '~/lib/url';
import { readdirSync } from 'node:fs';
import { textPageIndexable } from '~/lib/passages';
import { loadFreeReads } from '~/lib/free';

/**
 * llms.txt: the site described for a language model, in the shape the convention asks for
 * (llmstxt.org): a name, a one line summary, then sections of links with a sentence each.
 * Generated so the counts and the list of shelves are never stale. The full text of the
 * shelf notes and program descriptions is at /llms-full.txt.
 */
export const GET: APIRoute = async () => {
  const { works, authors, programs } = await loadCatalog();
  const [themes, eras, genres] = await Promise.all([getCollection('themes'), getCollection('eras'), getCollection('genres')]);
  const guided = works.filter(hasGuide).length;
  const free = await loadFreeReads();
  const freeHere = [...free.values()].filter((f) => !f.external).length;
  const u = (p: string) => abs(p);
  const lines = [
    '# The Great Books',
    '',
    `> Every work assigned by nine college Great Books and core-curriculum programs, in one place, with a reading guide for each, its themes, where it sits on each list, and the edition each program uses. ${works.length} works, ${authors.size} authors, nine programs. ${u('/')}`,
    '',
    'The nine lists are transcribed from each program\'s own published reading list, and every program page records the source and the date it was checked. The guides, bios and shelf notes are written for this site. Content is free to read and cite; a link back is appreciated. Program reading lists are facts and belong to nobody.',
    '',
    '## Books',
    '',
    `- [All the books](${u('/books/')}): ${works.length} works with filters by program, era, theme, form, difficulty and length. ${guided} have a written reading guide.`,
    `- Each book page (${u('/books/')}{slug}/) has a synopsis, why it is on the lists, key themes, marked passages with notes, difficulty and length, which programs assign it and where, which translation or edition to read and why (with the alternatives compared), and where to read it free when it is out of copyright. Book, Quotation and BreadcrumbList structured data; free editions are marked isAccessibleForFree.`,
    `- [Approachable](${u('/books/difficulty/approachable/')}), [moderate](${u('/books/difficulty/moderate/')}), [demanding](${u('/books/difficulty/demanding/')}), [difficult](${u('/books/difficulty/difficult/')}) and [formidable](${u('/books/difficulty/formidable/')}): the works by difficulty, each with a note on where to start.`,
    `- [Short](${u('/books/length/short/')}), [medium](${u('/books/length/medium/')}), [long](${u('/books/length/long/')}) and [epic](${u('/books/length/epic/')}): the works by length.`,
    '',
    '## Which translation, and reading free',
    '',
    `- [The best translations](${u('/translations/')}): the translation we recommend for every translated work with a guide, with one line on why. Each book page compares the alternatives under "Which translation to read".`,
    `- [Read the great books free](${u('/free/')}): the ${free.size} works on the lists that can be read free and legally online, ${freeHere} on this site and the rest at Standard Ebooks or Project Gutenberg, each with the translation to buy in print. Filter by program with ?program={id}, for example ${u('/free/?program=st-johns')}.`,
    '',
    '## Programs',
    '',
    ...programs.map((p) => `- [${p.data.name}](${u(`/programs/${p.id}/`)}): ${p.data.segments.length} ${p.data.segmentLabel.toLowerCase()}${p.data.segments.length === 1 ? '' : 's'}, in the program's own order, with the source.`),
    '',
    '## Themes',
    '',
    'Each theme page has an essay on what the works on it share, a place to start, a pairing to read together, and a companion page of marked passages.',
    '',
    ...themes.map((t) => `- [${t.data.label}](${u(`/themes/${t.id}/`)}): ${t.data.description ?? ''} Passages: ${u(`/themes/${t.id}/passages/`)}`),
    '',
    '## Eras',
    '',
    ...eras.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)).map((e) => `- [${e.data.label}](${u(`/eras/${e.id}/`)}): ${e.data.description ?? ''}`),
    '',
    '## Forms',
    '',
    ...genres.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)).map((g) => `- [${g.data.label}](${u(`/genres/${g.id}/`)}): ${g.data.description ?? ''}`),
    '',
    '## Authors',
    '',
    `- [All authors](${u('/authors/')}): ${authors.size} authors, each with a short biography, dates, and the works of theirs on the lists.`,
    '',
    '## Texts',
    '',
    'Public domain translations, one page per book, chapter or act. The pages listed here carry the guide\'s marked passages with a note on each, and link back to the guide. Cite the section page for a passage.',
    '',
    ...readdirSync('src/content/texts')
      .filter((w) => textPageIndexable(`/books/${w}/text/`))
      .map((w) => ({ w, title: works.find((x) => x.id === w)?.data.title ?? w }))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(({ w, title }) => `- [${title}](${u(`/books/${w}/text/`)}): contents, with the sections that hold a marked passage.`),
    '',
    '## Optional',
    '',
    `- [About](${u('/about/')}): how the lists were gathered and how the guides are written.`,
    `- [Disclosure](${u('/disclosure/')}): the site links to booksellers and earns a commission, disclosed on every page that carries one.`,
    `- [Full text for models](${u('/llms-full.txt')}): every shelf note and program description, and an index of the works, in one file.`,
    `- [Sitemap](${u('/sitemap-index.xml')})`,
    '',
    'Not here: the full text of copyrighted editions. Where a work is public domain the site may carry an older translation for finding a passage; the guide always names the edition the programs assign.',
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
