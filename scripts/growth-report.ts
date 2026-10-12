/**
 * The weekly growth numbers: what search shows of the site, and what readers click to buy.
 *
 * traffic-report.ts answers "did readers come"; this answers the two questions that decide
 * revenue after that. From Search Console: which queries show our pages, where we rank, and
 * which pages sit just off page one (the cheapest traffic to win). From GA4: affiliate_click
 * events, the closest thing to revenue the site can see, by page and by placement.
 *
 * It signs in as a read-only Google service account, so it needs no browser and no login:
 * the key file lives outside the repo at ~/.config/greatbookslist/google-service-account.json
 * (or wherever GOOGLE_APPLICATION_CREDENTIALS points). Nothing here can change anything in
 * either account; the scopes are read-only.
 *
 * Output goes to reports/, which is gitignored: this repository is public, and traffic and
 * click figures are not published. Each run prints a summary, appends one row to
 * reports/growth.csv, and writes the full detail to reports/growth-YYYY-MM-DD.json for the
 * weekly improvement pass to read.
 *
 *   npm run growth             # the last 28 days against the 28 before
 *   npm run growth -- --days 7
 */
import { createSign } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = 'greatbookslist.com';
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  join(homedir(), '.config/greatbookslist/google-service-account.json');

const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 28;
const DAY = 86_400_000;
// Search Console data settles two to three days behind; ending three days back keeps the
// two windows comparable instead of the newest one looking like a collapse.
const end = new Date(Date.now() - 3 * DAY);
const start = new Date(end.getTime() - (days - 1) * DAY);
const prevEnd = new Date(start.getTime() - DAY);
const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

interface ServiceAccount { client_email: string; private_key: string; token_uri: string }

function loadKey(): ServiceAccount {
  if (!existsSync(KEY_PATH)) {
    console.error(
      `No service account key at ${KEY_PATH}.\n` +
        'Create one (read-only, see docs/growth-plan.md, "Measurement setup") and save it there,\n' +
        'or point GOOGLE_APPLICATION_CREDENTIALS at it.',
    );
    process.exit(2);
  }
  return JSON.parse(readFileSync(KEY_PATH, 'utf8')) as ServiceAccount;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** Exchange a signed JWT for an access token: the service account flow, with no library. */
async function accessToken(sa: ServiceAccount, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: scopes.join(' '), aud: sa.token_uri, iat: now, exp: now + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key);
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claims}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function call<T>(token: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${new URL(url).pathname}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- Search Console

interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
const GSC = 'https://searchconsole.googleapis.com/webmasters/v3';

async function gscSite(token: string): Promise<string> {
  const { siteEntry = [] } = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, `${GSC}/sites`);
  const site = siteEntry.find((s) => s.siteUrl === `sc-domain:${HOST}`) ??
    siteEntry.find((s) => s.siteUrl.includes(HOST));
  if (!site) {
    throw new Error(
      `the service account cannot see ${HOST} in Search Console. Add its email ` +
        '(client_email in the key file) under Settings, Users and permissions, as Restricted.',
    );
  }
  return site.siteUrl;
}

async function gsc(token: string, site: string, from: Date, to: Date, dimensions: string[], rowLimit = 250): Promise<GscRow[]> {
  const { rows = [] } = await call<{ rows?: GscRow[] }>(
    token,
    `${GSC}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    { startDate: ymd(from), endDate: ymd(to), dimensions, rowLimit, dataState: 'final' },
  );
  return rows;
}

const totals = (rows: GscRow[]) => {
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  // Impression-weighted, which is what Search Console's own headline position means.
  const position = impressions ? rows.reduce((n, r) => n + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
};

// ---------------------------------------------------------------- GA4

const GA_ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const GA_DATA = 'https://analyticsdata.googleapis.com/v1beta';

async function ga4Property(token: string): Promise<string> {
  if (process.env.GA4_PROPERTY_ID) return process.env.GA4_PROPERTY_ID;
  const { accountSummaries = [] } = await call<{
    accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[];
  }>(token, `${GA_ADMIN}/accountSummaries`);
  const props = accountSummaries.flatMap((a) => a.propertySummaries ?? []);
  const pick = props.find((p) => /great ?books/i.test(p.displayName)) ?? (props.length === 1 ? props[0] : undefined);
  if (!pick) {
    throw new Error(
      props.length
        ? `several GA4 properties visible (${props.map((p) => p.displayName).join(', ')}); set GA4_PROPERTY_ID`
        : 'the service account cannot see any GA4 property. Add its email under Admin, Property access management, as Viewer.',
    );
  }
  return pick.property.replace('properties/', '');
}

interface GaReport { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }

async function clicksBy(token: string, property: string, dimension: string, from: Date, to: Date) {
  const r = await call<GaReport>(token, `${GA_DATA}/properties/${property}:runReport`, {
    dateRanges: [{ startDate: ymd(from), endDate: ymd(to) }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'affiliate_click' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  });
  return (r.rows ?? []).map((row) => ({ key: row.dimensionValues[0].value, clicks: Number(row.metricValues[0].value) }));
}

/** Placement and retailer are event parameters; GA4 only reports them once they are
 * registered as custom dimensions. Until then, say so rather than fail the whole run. */
async function clicksByParam(token: string, property: string, param: string, from: Date, to: Date) {
  try {
    return await clicksBy(token, property, `customEvent:${param}`, from, to);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- run

const sa = loadKey();
const token = await accessToken(sa, [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
]);
const out: string[] = [`${HOST}, ${ymd(start)} to ${ymd(end)} (${days} days, against the ${days} before)`];
const detail: Record<string, unknown> = { start: ymd(start), end: ymd(end), days };

let search: ReturnType<typeof totals> | null = null;
let searchPrev: ReturnType<typeof totals> | null = null;
try {
  const site = await gscSite(token);
  const [byDate, byDatePrev, queries, pages] = await Promise.all([
    gsc(token, site, start, end, ['date']),
    gsc(token, site, prevStart, prevEnd, ['date']),
    gsc(token, site, start, end, ['query'], 1000),
    gsc(token, site, start, end, ['page'], 1000),
  ]);
  search = totals(byDate);
  searchPrev = totals(byDatePrev);
  const pct = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'new');

  // Striking distance: queries on page two or the bottom of page one with real demand.
  // Moving one of these up a few places is worth more than any number of new pages.
  const striking = queries
    .filter((q) => q.position >= 5 && q.position <= 20 && q.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
  // Seen but not chosen: pages shown often enough to matter whose result is not clicked.
  const unclicked = pages
    .filter((p) => p.impressions >= 20 && p.ctr < 0.01)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  out.push(
    '',
    'Search (Google Search Console)',
    `  clicks        ${search.clicks}   (${pct(search.clicks, searchPrev.clicks)})`,
    `  impressions   ${search.impressions}   (${pct(search.impressions, searchPrev.impressions)})`,
    `  CTR           ${(search.ctr * 100).toFixed(1)}%`,
    `  avg position  ${search.position.toFixed(1)}`,
    `  pages seen    ${pages.length}   queries seen ${queries.length}`,
    '',
    'Top queries by impressions',
    ...queries.sort((a, b) => b.impressions - a.impressions).slice(0, 15)
      .map((q) => `  ${String(q.impressions).padStart(6)} impr  ${String(q.clicks).padStart(4)} clk  pos ${q.position.toFixed(1).padStart(5)}  ${q.keys[0]}`),
    '',
    'Striking distance (position 5 to 20, the cheapest wins)',
    ...(striking.length ? striking.slice(0, 10).map((q) => `  pos ${q.position.toFixed(1).padStart(5)}  ${String(q.impressions).padStart(5)} impr  ${q.keys[0]}`) : ['  none yet']),
    '',
    'Shown but not clicked (20+ impressions, under 1% CTR)',
    ...(unclicked.length ? unclicked.map((p) => `  ${String(p.impressions).padStart(6)} impr  ${p.keys[0].replace(`https://${HOST}`, '')}`) : ['  none yet']),
  );
  Object.assign(detail, { site, search, searchPrev, queries, pages, striking, unclicked });
} catch (err) {
  out.push('', `Search Console: ${(err as Error).message}`);
}

let clickTotal: number | null = null;
try {
  const property = await ga4Property(token);
  const [byPage, placement, retailer] = await Promise.all([
    clicksBy(token, property, 'pagePath', start, end),
    clicksByParam(token, property, 'placement', start, end),
    clicksByParam(token, property, 'retailer', start, end),
  ]);
  clickTotal = byPage.reduce((n, r) => n + r.clicks, 0);
  out.push(
    '',
    'Buy clicks (GA4 affiliate_click)',
    `  total         ${clickTotal}`,
    ...(search?.clicks ? [`  per search visit  ${(clickTotal / search.clicks).toFixed(2)}`] : []),
    '  by page:',
    ...(byPage.length ? byPage.slice(0, 10).map((r) => `    ${String(r.clicks).padStart(4)}  ${r.key}`) : ['    none yet']),
    placement
      ? '  by placement: ' + (placement.map((r) => `${r.key} ${r.clicks}`).join(', ') || 'none yet')
      : '  by placement: register "placement" as a custom dimension in GA4 to see this',
    retailer
      ? '  by retailer:  ' + (retailer.map((r) => `${r.key} ${r.clicks}`).join(', ') || 'none yet')
      : '  by retailer:  register "retailer" as a custom dimension in GA4 to see this',
  );
  Object.assign(detail, { ga4Property: property, clicks: { total: clickTotal, byPage, placement, retailer } });
} catch (err) {
  out.push('', `GA4: ${(err as Error).message}`);
}

console.log(out.join('\n'));

mkdirSync('reports', { recursive: true });
writeFileSync(`reports/growth-${ymd(new Date())}.json`, JSON.stringify(detail, null, 2));
const csv = 'reports/growth.csv';
if (!existsSync(csv)) writeFileSync(csv, 'run_date,days,search_clicks,impressions,ctr,avg_position,buy_clicks\n');
appendFileSync(csv, [
  ymd(new Date()), days, search?.clicks ?? '', search?.impressions ?? '',
  search ? search.ctr.toFixed(4) : '', search ? search.position.toFixed(1) : '', clickTotal ?? '',
].join(',') + '\n');
console.log(`\nWrote reports/growth-${ymd(new Date())}.json and appended to ${csv}`);
