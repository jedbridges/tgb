import { abs, workUrl, authorUrl } from './url';
import type { Work, Author } from './catalog';

export const breadcrumbs = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
});

/**
 * inLanguage wants an IETF language tag, not a word. It was emitting "greek", which is not
 * a tag and means nothing to a parser; grc is Ancient Greek and is what these texts are.
 */
const LANG: Record<string, string> = {
  greek: 'grc', latin: 'la', hebrew: 'hbo', aramaic: 'arc', arabic: 'ar', persian: 'fa',
  sanskrit: 'sa', chinese: 'zh', japanese: 'ja', english: 'en', french: 'fr', german: 'de',
  italian: 'it', spanish: 'es', portuguese: 'pt', russian: 'ru', dutch: 'nl', danish: 'da',
  norwegian: 'no', swedish: 'sv', 'old-english': 'ang', 'old-norse': 'non', 'middle-english': 'enm',
  'church-slavonic': 'cu', czech: 'cs', polish: 'pl', turkish: 'tr',
};

export const bookLd = (work: Work, author: Author, image?: string) => {
  const d = work.data;
  const ed = d.recommendedEdition;
  return {
    '@context': 'https://schema.org', '@type': 'Book',
    '@id': abs(workUrl(work.id)),
    name: d.title,
    alternateName: d.originalTitle,
    author: { '@type': 'Person', name: author.data.name, url: abs(authorUrl(author.id)) },
    inLanguage: LANG[d.language.id] ?? d.language.id,
    datePublished: d.year > 0 ? String(d.year) : undefined,
    // A work written in 750 BCE has no ISO publication date, but the period is a real fact
    // and temporalCoverage is the field that can carry it.
    temporalCoverage: d.yearDisplay ?? undefined,
    isbn: ed?.isbn13,
    numberOfPages: d.pages,
    image,
    description: d.synopsis,
    genre: d.genre.id,
    about: d.themes.map((t) => ({ '@type': 'Thing', name: t.id.replace(/-/g, ' ') })),
    keywords: [...d.themes.map((t) => t.id), ...d.keywords].join(', '),
    /*
     * The edition, as its own thing. The work is Homer's Iliad; the book you can buy is
     * Lattimore's, from Chicago, with its own ISBN. Collapsing the two loses the fact a
     * reader and an answer engine both want, which is precisely which edition to get.
     */
    workExample: ed?.isbn13
      ? {
          '@type': 'Book', '@id': `${abs(workUrl(work.id))}#edition`,
          bookFormat: 'https://schema.org/Paperback',
          name: ed.title ?? d.title,
          isbn: ed.isbn13,
          translator: ed.translator ? { '@type': 'Person', name: ed.translator } : undefined,
          publisher: ed.publisher ? { '@type': 'Organization', name: ed.publisher } : undefined,
          datePublished: ed.year ? String(ed.year) : undefined,
          inLanguage: 'en',
        }
      : undefined,
  };
};

export const personLd = (author: Author) => ({
  '@context': 'https://schema.org', '@type': 'Person',
  '@id': abs(authorUrl(author.id)),
  name: author.data.name,
  alternateName: author.data.aliases,
  birthDate: author.data.born !== undefined && author.data.born > 0 ? String(author.data.born) : undefined,
  deathDate: author.data.died !== undefined && author.data.died > 0 ? String(author.data.died) : undefined,
});

export const websiteLd = () => ({
  '@context': 'https://schema.org', '@type': 'WebSite', name: 'The Great Books', url: abs('/'),
  potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: abs('/books/') + '?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
});
