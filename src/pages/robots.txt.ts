import type { APIRoute } from 'astro';

/** Generated so the Sitemap directive carries an absolute URL, which the spec requires,
 *  and so it follows SITE_URL to a custom domain without a manual edit. */
export const GET: APIRoute = ({ site }) => {
  const origin = (site?.toString() ?? 'http://localhost:4321').replace(/\/$/, '');
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap-index.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
