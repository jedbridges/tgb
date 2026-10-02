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
interface AutoRAGBinding { aiSearch(opts: { query: string; rewrite_query?: boolean; max_num_results?: number; system_prompt?: string }): Promise<AutoRAGResult> }
interface Ai { autorag(name: string): AutoRAGBinding }
interface Fetcher { fetch(request: Request): Promise<Response> }
interface RateLimit { limit(o: { key: string }): Promise<{ success: boolean }> }
export interface Env { ASSETS: Fetcher; AI: Ai; ASK_PER_VISITOR?: RateLimit; ASK_SITEWIDE?: RateLimit; SUBSCRIBE_PER_VISITOR?: RateLimit; BUTTONDOWN_API_KEY?: string }

const MAX_QUERY = 500;

/* The default prompt answered with "According to the provided documents", named source
   files by their path, and hedged where the texts take a side. This one writes for a
   reader of the site: a direct answer, works named by title and author, and the sources
   left to the numbered list the page already shows under the answer. */
const SYSTEM_PROMPT = `You answer questions for readers of The Great Books (greatbookslist.com), a guide to the works assigned by college Great Books programs.

Use only the passages provided. They are the site's own reading guides, author notes, shelf essays and public domain texts of the works.

- Answer the question directly in the first sentence, then support it. Two or three short paragraphs at most.
- Name works by title and author, in the reader's terms: "Montaigne, in the essay Of the Most Excellent Men", "Augustine, City of God, Book III". Never mention files, paths, documents, sources, context or "the provided" anything.
- Where the works take a position, say what it is and who holds it. Where they disagree, say who says what. Do not answer "there is no consensus" when the texts give views.
- If the passages do not cover the question, say in one sentence that the library's guides and texts do not address it, and suggest the closest thing they do cover.
- Plain prose. No headings, no bullet lists, no markdown, no em dashes.`;

/* An object's url, title and kind, from its R2 metadata when the sync set it, else from its
   path in the corpus (scripts/export-corpus.ts decides both). */
const SHELF_URL: Record<string, (id: string) => string> = {
  difficulties: (id) => `/books/difficulty/${id}/`, lengths: (id) => `/books/length/${id}/`,
  themes: (id) => `/themes/${id}/`, eras: (id) => `/eras/${id}/`, genres: (id) => `/genres/${id}/`,
};
const words = (slug: string) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function fromPath(path: string): { url: string; title: string; kind: string } | null {
  const p = path.replace(/^\/+/, '').replace(/\.md$/, '');
  let m;
  if ((m = p.match(/^guides\/(.+)$/))) return { url: `/books/${m[1]}/`, title: words(m[1]), kind: 'guide' };
  if ((m = p.match(/^authors\/(.+)$/))) return { url: `/authors/${m[1]}/`, title: words(m[1]), kind: 'author' };
  if ((m = p.match(/^programs\/(.+)$/))) return { url: `/programs/${m[1]}/`, title: words(m[1]), kind: 'program' };
  if ((m = p.match(/^texts\/([^/]+)\/(.+)$/))) return { url: `/books/${m[1]}/text/${m[2]}/`, title: `${words(m[1])}: ${words(m[2])}`, kind: 'passage' };
  if ((m = p.match(/^shelves\/([a-z]+)-(.+)$/)) && SHELF_URL[m[1]]) return { url: SHELF_URL[m[1]](m[2]), title: words(m[2]), kind: 'shelf' };
  return null;
}
const meta = (v: unknown) => { if (typeof v !== 'string' || !v) return ''; try { return decodeURIComponent(v); } catch { return v; } };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/ask') return ask(request, env);
    if (url.pathname === '/api/subscribe') return subscribe(request, env);
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
  // Checked after the cheap validation, before the paid call. A missing binding (local dev)
  // means no limit rather than no answers.
  const visitor = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const [mine, all] = await Promise.all([
    env.ASK_PER_VISITOR?.limit({ key: visitor }) ?? { success: true },
    env.ASK_SITEWIDE?.limit({ key: 'all' }) ?? { success: true },
  ]);
  if (!mine.success || !all.success) return json({ error: 'too many questions; try again in a minute' }, 429, { 'retry-after': '60' });
  try {
    const result = await env.AI.autorag('tgb-ask').aiSearch({ query, rewrite_query: true, max_num_results: 8, system_prompt: SYSTEM_PROMPT });
    // Several chunks of one page are one source; the list shows each page once, in rank order.
    const seen = new Set<string>();
    const sources: { url: string; title: string; kind: string }[] = [];
    for (const d of result.data ?? []) {
      const path = fromPath(d.filename);
      // AI Search nests an object's custom metadata under attributes.file; read both places.
      const a = { ...d.attributes, ...(d.attributes?.file as Record<string, unknown> | undefined) };
      const url = meta(a.url) || path?.url || '';
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, title: meta(a.title) || path?.title || url, kind: meta(a.kind) || path?.kind || '' });
      if (sources.length === 6) break;
    }
    return json({ answer: result.response, sources });
  } catch (e) {
    console.error('ask failed', e);
    return json({ error: 'the answer service is unavailable' }, 502);
  }
}

/*
 * Subscribing without leaving the site. Buttondown's own embed endpoint has to be posted
 * to by a real form because its reply sometimes carries a CAPTCHA or a validation error
 * the reader has to see, which is why their docs tell you not to fetch it. Going through
 * the API from here instead keeps the key out of the browser, keeps their code off the
 * page, and leaves the wording of success and failure to us. The form still works with
 * no JavaScript at all: it posts to Buttondown directly, and only the inline path comes
 * through here.
 */
async function subscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.BUTTONDOWN_API_KEY) return json({ error: 'the signup service is not configured' }, 503);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  const b = body as { email?: unknown; from?: unknown; website?: unknown } | null;

  /* A hidden field no person can fill in. Bots fill in everything. */
  if (typeof b?.website === 'string' && b.website.trim() !== '') return json({ ok: true });

  const email = typeof b?.email === 'string' ? b.email.trim().slice(0, 254) : '';
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) return json({ error: 'that does not look like an email address' }, 400);
  const from = typeof b?.from === 'string' && /^[a-z-]{1,24}$/.test(b.from) ? b.from : 'site';

  /* Anyone can post here, and a subscribe sends mail to an address the sender chose, so
     the limit is what stops this being a way to pester a stranger's inbox. Buttondown's
     double opt-in is the other half: an unconfirmed address never receives an issue. */
  const visitor = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ok = await (env.SUBSCRIBE_PER_VISITOR?.limit({ key: visitor }) ?? Promise.resolve({ success: true }));
  if (!ok.success) return json({ error: 'too many attempts; try again in a minute' }, 429, { 'retry-after': '60' });

  try {
    const r = await fetch('https://api.buttondown.com/v1/subscribers', {
      method: 'POST',
      headers: { Authorization: `Token ${env.BUTTONDOWN_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email_address: email, tags: [`from-${from}`] }),
    });
    if (r.status === 201) return json({ ok: true, state: 'new' });
    /* Already on the list. Saying so is friendlier than an error, and it tells no-one
       anything they could not learn by trying the same address twice anyway. */
    if (r.status === 400 || r.status === 409) {
      const text = await r.text();
      if (/already|exists|duplicate/i.test(text)) return json({ ok: true, state: 'existing' });
      console.error('subscribe rejected', r.status, text.slice(0, 300));
      return json({ error: 'that address was not accepted' }, 400);
    }
    console.error('subscribe failed', r.status, (await r.text()).slice(0, 300));
    return json({ error: 'the signup service is unavailable' }, 502);
  } catch (e) {
    console.error('subscribe threw', e);
    return json({ error: 'the signup service is unavailable' }, 502);
  }
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}
