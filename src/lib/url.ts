export const SITE = (import.meta.env.SITE || 'http://localhost:4321').replace(/\/$/, '');
export const url = (path: string) => (path.startsWith('/') ? path : `/${path}`).replace(/\/?$/, '/');
export const abs = (path: string) => new URL(url(path), SITE + '/').toString();
export const workUrl = (slug: string) => url(`/books/${slug}`);
export const authorUrl = (slug: string) => url(`/authors/${slug}`);
export const programUrl = (slug: string, segment?: string) => url(`/programs/${slug}`) + (segment ? `#${segment}` : '');
export const taxUrl = (kind: 'themes' | 'genres' | 'eras' | 'regions' | 'languages', id: string) => url(`/${kind}/${id}`);
