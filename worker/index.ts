/**
 * Answers over the site's own writing. /api/ask retrieves and generates through Cloudflare
 * AI Search (the `tgb-ask` AutoRAG instance, its corpus synced to R2 by
 * scripts/sync-corpus.ts on every deploy) and every other path falls through to the static
 * site. `run_worker_first` in wrangler.jsonc scopes that fallthrough to /api/*, so this
 * Worker only runs at all for the one route. docs/search-plan.md, 3a and 3b.
 *
 * Minimal local types stand in for @cloudflare/workers-types so the rest of the build,
 * which targets a browser, does not take on Workers-runtime globals it never uses.
 */
interface AutoRAGSource { filename: string; score: number; attributes?: Record<string, unknown> }
interface AutoRAGResult { response: string; data: AutoRAGSource[] }
interface AutoRAGBinding { aiSearch(opts: { query: string; rewrite_query?: boolean; max_num_results?: number }): Promise<AutoRAGResult> }
interface Ai { autorag(name: string): AutoRAGBinding }
interface Fetcher { fetch(request: Request): Promise<Response> }
export interface Env { ASSETS: Fetcher; AI: Ai }

const MAX_QUERY = 500;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/ask') return ask(request, env);
    return env.ASSETS.fetch(request);
  },
};

async function ask(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  const raw = (body as { query?: unknown } | null)?.query;
  const query = typeof raw === 'string' ? raw.trim().slice(0, MAX_QUERY) : '';
  if (!query) return json({ error: 'a query is required' }, 400);
  try {
    const result = await env.AI.autorag('tgb-ask').aiSearch({ query, rewrite_query: true, max_num_results: 8 });
    const sources = result.data
      .map((d) => ({
        url: typeof d.attributes?.url === 'string' ? d.attributes.url : '',
        title: typeof d.attributes?.title === 'string' ? d.attributes.title : d.filename,
        kind: typeof d.attributes?.kind === 'string' ? d.attributes.kind : '',
      }))
      .filter((s) => s.url);
    return json({ answer: result.response, sources });
  } catch (e) {
    console.error('ask failed', e);
    return json({ error: 'the answer service is unavailable' }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
