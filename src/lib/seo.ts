import { abs, workUrl, authorUrl } from './url';
import type { Work, Author } from './catalog';

export const breadcrumbs = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
});

export const bookLd = (work: Work, author: Author, image?: string) => ({
  '@context': 'https://schema.org', '@type': 'Book',
  '@id': abs(workUrl(work.id)),
  name: work.data.title,
  alternateName: work.data.originalTitle,
  author: { '@type': 'Person', name: author.data.name, url: abs(authorUrl(author.id)) },
  inLanguage: work.data.language.id,
  datePublished: work.data.year > 0 ? String(work.data.year) : undefined,
  isbn: work.data.recommendedEdition?.isbn13,
  image: image,
  description: work.data.synopsis,
  genre: work.data.genre.id,
  keywords: [...work.data.themes.map((t) => t.id), ...work.data.keywords].join(', '),
});

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
