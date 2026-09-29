import { abs, workUrl, authorUrl } from './url';
import type { Work, Author } from './catalog';
import { lastModified, workFile, authorFile } from './lastmod';

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

export const organizationLd = () => ({
  '@type': 'Organization', '@id': abs('/') + '#org', name: 'The Great Books', url: abs('/'),
  logo: { '@type': 'ImageObject', url: abs('/apple-touch-icon.png').replace(/\/$/, '') },
});

export const bookLd = (work: Work, author: Author, image?: string) => {
  const d = work.data;
  const ed = d.recommendedEdition;
  return {
    '@context': 'https://schema.org', '@type': 'Book',
    '@id': abs(workUrl(work.id)),
    name: d.title,
    /* The guide's own date, from git. A page that says when it was last worked on is one an
       answer engine can rank for freshness; one that does not is guessed at. */
    dateModified: lastModified(workFile(work.id)),
    publisher: organizationLd(),
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
     * The editions, each as its own thing. The work is Homer's Iliad; the book you can buy is
     * Lattimore's, from Chicago, with its own ISBN. Collapsing the two loses the fact a
     * reader and an answer engine both want, which is precisely which edition to get.
     */
    workExample: (() => {
      const eds = [ed, ...d.otherEditions].filter((e): e is NonNullable<typeof ed> => Boolean(e?.isbn13));
      if (!eds.length) return undefined;
      const items = eds.map((e, i) => ({
        '@type': 'Book', '@id': `${abs(workUrl(work.id))}#edition${i === 0 && e === ed ? '' : `-${e.isbn13}`}`,
        bookFormat: 'https://schema.org/Paperback',
        name: e.title ?? d.title,
        isbn: e.isbn13,
        translator: e.translator ? { '@type': 'Person', name: e.translator } : undefined,
        publisher: e.publisher ? { '@type': 'Organization', name: e.publisher } : undefined,
        datePublished: e.year ? String(e.year) : undefined,
        inLanguage: 'en',
      }));
      return items.length === 1 ? items[0] : items;
    })(),
  };
};

export const personLd = (author: Author) => ({
  '@context': 'https://schema.org', '@type': 'Person',
  '@id': abs(authorUrl(author.id)),
  name: author.data.name,
  alternateName: author.data.aliases,
  dateModified: lastModified(authorFile(author.id)),
  birthDate: author.data.born !== undefined && author.data.born > 0 ? String(author.data.born) : undefined,
  deathDate: author.data.died !== undefined && author.data.died > 0 ? String(author.data.died) : undefined,
});

/**
 * The guide's marked passages as Quotation objects, one per highlight, each anchored to
 * its place on the page. A search for the line itself then has a page that says, in the
 * schema's own terms, that this is a quotation from this book by this author.
 */
export const quotationsLd = (work: Work, author: Author) =>
  work.data.highlights.map((h, i) => ({
    '@context': 'https://schema.org', '@type': 'Quotation',
    '@id': `${abs(workUrl(work.id))}#passage-${i + 1}`,
    text: h.text,
    isPartOf: { '@type': 'Book', '@id': abs(workUrl(work.id)), name: work.data.title },
    creator: { '@type': 'Person', name: author.data.name },
    ...(h.location ? { citation: h.location } : {}),
    ...(h.translator ? { translator: { '@type': 'Person', name: h.translator } } : {}),
  }));

export const websiteLd = () => ({
  '@context': 'https://schema.org', '@type': 'WebSite', name: 'The Great Books', url: abs('/'),
  publisher: organizationLd(),
  potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: abs('/books/') + '?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
});
