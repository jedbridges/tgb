import type { APIRoute } from 'astro';
import { loadCatalog } from '~/lib/catalog';

/**
 * Author names and theme labels, for the palette's empty state. Fetched only when a
 * search finds nothing, so no page pays for it up front. About 8KB.
 */
export const GET: APIRoute = async () => {
  const { authors } = await loadCatalog();
  const names = [...authors.values()].map((a) => a.data.name).sort();
  return new Response(JSON.stringify({ authors: names }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
};
