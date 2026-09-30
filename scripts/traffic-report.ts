/**
 * A week of greatbookslist.com traffic from Cloudflare, in the terms that decide revenue.
 *
 * Edge request counts on this site are almost all crawlers (about 99% in the first week), so
 * they say nothing about readers. The numbers that matter come from Web Analytics, the
 * browser beacon Cloudflare injects: real page loads, real visits, and where those visits
 * came from. Search referrals are the line to watch; they are what turns into buy clicks.
 *
 * It borrows the wrangler login on this machine rather than needing its own token, running
 * `wrangler whoami` first so an expired OAuth token is refreshed. Each run prints a summary
 * and appends one row to reports/traffic.csv, so the trend is one file.
 *
 *   npm run report             # the last 7 days
 *   npm run report -- --days 28
 */
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ZONE = '7acb947005cea4a67606843b323234b6';     // greatbookslist.com
const ACCOUNT = '857288c4525ed3168fa33c44527ab5ee';
const HOSTS = ['greatbookslist.com', 'www.greatbookslist.com'];

const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 7;
const end = new Date();
const start = new Date(end.getTime() - days * 86_400_000);
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const day = (d: Date) => d.toISOString().slice(0, 10);

function token(): string {
  execSync('npx wrangler whoami', { stdio: 'ignore' });
  const candidates = [
    join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
    join(homedir(), '.config/.wrangler/config/default.toml'),
    join(homedir(), '.wrangler/config/default.toml'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  throw new Error('No wrangler OAuth token found. Run `npx wrangler login` once on this machine.');
}
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? token();

async function gql<T>(query: string): Promise<T> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] | null };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data as T;
}

type Group<D> = { count: number; sum?: { visits: number }; dimensions: D };
const rumFilter = `{datetime_geq:"${iso(start)}",datetime_leq:"${iso(end)}",requestHost_in:${JSON.stringify(HOSTS)},bot:0}`;
const rum = <D>(dim: string, limit = 15) =>
  gql<{ viewer: { accounts: { g: Group<D>[] }[] } }>(
    `{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){g:rumPageloadEventsAdaptiveGroups(limit:${limit},filter:${rumFilter},orderBy:[sum_visits_DESC,count_DESC]){count sum{visits} dimensions{${dim}}}}}}`,
  ).then((d) => d.viewer.accounts[0]?.g ?? []);

const [edge, totals, referrers, paths, missing] = await Promise.all([
  gql<{ viewer: { zones: { g: { sum: { requests: number; pageViews: number } }[] }[] } }>(
    `{viewer{zones(filter:{zoneTag:"${ZONE}"}){g:httpRequests1dGroups(limit:60,filter:{date_geq:"${day(start)}",date_leq:"${day(end)}"}){sum{requests pageViews}}}}}`,
  ).then((d) => d.viewer.zones[0].g.reduce((a, r) => ({ requests: a.requests + r.sum.requests, pageViews: a.pageViews + r.sum.pageViews }), { requests: 0, pageViews: 0 })),
  rum<{ date: string }>('date', 60),
  rum<{ refererHost: string }>('refererHost', 20),
  rum<{ requestPath: string }>('requestPath', 12),
  gql<{ viewer: { zones: { g: Group<{ clientRequestPath: string }>[] }[] } }>(
    `{viewer{zones(filter:{zoneTag:"${ZONE}"}){g:httpRequestsAdaptiveGroups(limit:40,filter:{datetime_geq:"${iso(start)}",datetime_leq:"${iso(end)}",edgeResponseStatus:404},orderBy:[count_DESC]){count dimensions{clientRequestPath}}}}}`,
  ).then((d) => d.viewer.zones[0].g),
]);

const pageloads = totals.reduce((a, r) => a + r.count, 0);
const visits = totals.reduce((a, r) => a + (r.sum?.visits ?? 0), 0);
// Our own hosts as referrer are internal navigation, not a way in.
const external = referrers.filter((r) => r.dimensions.refererHost && !HOSTS.includes(r.dimensions.refererHost));
const isSearch = (h: string) => /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu|brave|kagi|startpage)\./.test(h) || /chatgpt|perplexity|copilot|claude|gemini/.test(h);
const searchVisits = external.filter((r) => isSearch(r.dimensions.refererHost)).reduce((a, r) => a + (r.sum?.visits ?? 0), 0);
const otherVisits = external.filter((r) => !isSearch(r.dimensions.refererHost)).reduce((a, r) => a + (r.sum?.visits ?? 0), 0);
const directVisits = referrers.find((r) => !r.dimensions.refererHost)?.sum?.visits ?? 0;
// Break-in probes for software this site does not run are noise, not broken links.
const probe = /wp-|wordpress|\.php|\.env|\.git|xmlrpc|cgi-bin|\.aws|\.ds_store|config|credentials|kubeconfig|\.key$|\.sql|pprof|telescope|actuator|\.well-known\/traffic-advice/i;
const broken = missing.filter((m) => !probe.test(m.dimensions.clientRequestPath)).slice(0, 8);

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');
const out = [
  `greatbookslist.com, ${day(start)} to ${day(end)} (${days} days)`,
  '',
  `Readers (Web Analytics, sampled)`,
  `  page loads      ${pageloads}`,
  `  visits          ${visits}`,
  `  from search     ${searchVisits}   (Google, Bing, DuckDuckGo, AI answer engines)`,
  `  from other sites ${otherVisits}`,
  `  direct / none   ${directVisits}`,
  '',
  `Edge (everything, including crawlers)`,
  `  requests        ${edge.requests}`,
  `  HTML page views ${edge.pageViews}   readers are ${pct(pageloads, edge.pageViews)} of these`,
  '',
  'Where visits came from',
  ...(external.length ? external.slice(0, 10).map((r) => `  ${String(r.sum?.visits ?? 0).padStart(5)}  ${r.dimensions.refererHost}`) : ['  (no external referrers yet)']),
  '',
  'Top landing pages (by visits)',
  ...paths.filter((p) => (p.sum?.visits ?? 0) > 0).slice(0, 10).map((p) => `  ${String(p.sum?.visits ?? 0).padStart(5)}  ${p.dimensions.requestPath}`),
  '',
  'Missing pages people or crawlers asked for (probes excluded)',
  ...(broken.length ? broken.map((m) => `  ${String(m.count).padStart(5)}  ${m.dimensions.clientRequestPath}`) : ['  (none)']),
  '',
  'Affiliate clicks and earnings are not in Cloudflare: see GA4 (affiliate_click, by placement) and the Amazon and Bookshop dashboards.',
];
console.log(out.join('\n'));

mkdirSync('reports', { recursive: true });
const csv = 'reports/traffic.csv';
if (!existsSync(csv)) writeFileSync(csv, 'run_date,days,edge_requests,edge_pageviews,rum_pageloads,rum_visits,search_visits,other_site_visits,direct_visits,top_referrer\n');
appendFileSync(csv, [day(end), days, edge.requests, edge.pageViews, pageloads, visits, searchVisits, otherVisits, directVisits, external[0]?.dimensions.refererHost ?? ''].join(',') + '\n');
console.log(`\nAppended to ${csv}`);
