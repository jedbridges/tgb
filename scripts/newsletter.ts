/**
 * Build the weekly email and hand it to Buttondown as a scheduled send.
 *
 * The email is assembled, not written. Every work file already carries the three things
 * the signup form promises (why it matters, how to read it, which translation to get),
 * and that prose has been through validate-content. Generating fresh copy each week
 * would drift from the house voice and bypass every check, in the one channel where a
 * mistake cannot be edited after the fact.
 *
 *   npx tsx scripts/newsletter.ts --dry-run             the next email, printed
 *   npx tsx scripts/newsletter.ts --dry-run --work X    any work, printed
 *   npx tsx scripts/newsletter.ts --dry-run --weeks 3   the next three, printed
 *   npx tsx scripts/newsletter.ts --schedule            create the scheduled draft
 *   npx tsx scripts/newsletter.ts --configure           point Buttondown's redirects here
 *   npx tsx scripts/newsletter.ts --diagnose            what the list looks like from here
 *   npx tsx scripts/newsletter.ts --verify              prove the send path, send nothing
 *   npx tsx scripts/newsletter.ts --nudge               resend confirmation to the unconfirmed
 *
 * A dry run makes no network call of any kind. --schedule needs BUTTONDOWN_API_KEY and
 * refuses to act if the work it picked has already gone out.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { parse } from 'yaml';

const API = 'https://api.buttondown.com/v1';
const SITE = (process.env.SITE_URL || 'https://greatbookslist.com').replace(/\/$/, '');
const AMAZON_TAG = (process.env.AMAZON_ASSOCIATE_TAG || '').trim();
const KEY = (process.env.BUTTONDOWN_API_KEY || '').trim();

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
const DRY = flag('dry-run') || !(flag('schedule') || flag('configure') || flag('diagnose') || flag('verify') || flag('nudge'));

/* Every email carries this marker so the next run can see what has already gone out.
   Buttondown is the source of truth for that, not a file in the repo, because a file
   can be reverted or a run can fail after sending and leave the two disagreeing. */
const MARK = (slug: string) => `<!-- gbl:work=${slug} -->`;
const MARK_RE = /<!--\s*gbl:work=([a-z0-9-]+)\s*-->/g;

interface Work { slug: string; data: Record<string, any>; body: string }

const fm = (file: string) => {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`no front matter in ${file}`);
  return { data: parse(m[1]) as Record<string, any>, body: m[2].trim() };
};

const works = new Map<string, Work>(
  readdirSync('src/content/works')
    .filter((f) => f.endsWith('.md'))
    .map((f) => { const slug = f.replace(/\.md$/, ''); return [slug, { slug, ...fm(`src/content/works/${f}`) }]; }),
);
const authors = new Map(
  readdirSync('src/content/authors').filter((f) => f.endsWith('.md'))
    .map((f) => [f.replace(/\.md$/, ''), fm(`src/content/authors/${f}`).data]),
);
const schedule = parse(readFileSync('content/newsletter.yaml', 'utf8')) as any;

/* Amazon's product id for a printed book is the ISBN-10, so a 978 ISBN-13 becomes a
   direct product link rather than a search page listing the translations the email just
   spent a paragraph choosing between. This mirrors isbn13ToAsin in src/lib/affiliates.ts,
   which cannot be imported here: it reads import.meta.env at module load. */
const isbn13ToAsin = (isbn13?: string): string | undefined => {
  if (!isbn13) return undefined;
  const d = isbn13.replace(/[^0-9]/g, '');
  if (d.length !== 13 || !d.startsWith('978')) return undefined;
  const core = d.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const rem = 11 - (sum % 11);
  return core + (rem === 11 ? '0' : rem === 10 ? 'X' : String(rem));
};

const amazonUrl = (isbn13: string | undefined, title: string, author: string) => {
  const asin = isbn13ToAsin(isbn13);
  const base = asin ? `https://www.amazon.com/dp/${asin}`
    : isbn13 ? `https://www.amazon.com/s?k=${isbn13}&i=stripbooks`
    : `https://www.amazon.com/s?k=${encodeURIComponent(`${title} ${author}`)}&i=stripbooks`;
  const u = new URL(base);
  if (AMAZON_TAG) { u.searchParams.set('tag', AMAZON_TAG); u.searchParams.set('linkCode', 'll1'); }
  return u.toString();
};

/* The instant whose local time in the given zone is the wanted wall clock. Mountain time
   is six or seven hours behind UTC depending on the month, so the offset is read back
   from the candidate rather than assumed. */
const zoned = (y: number, mo: number, d: number, h: number, tz: string) => {
  let t = Date.UTC(y, mo, d, h, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(new Date(t)).reduce<Record<string, number>>((a, p) => (p.type !== 'literal' ? { ...a, [p.type]: Number(p.value) } : a), {});
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute);
    const drift = Date.UTC(y, mo, d, h, 0) - seen;
    if (drift === 0) break;
    t += drift;
  }
  return new Date(t);
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The next configured send day strictly after `from`, at the configured local hour. */
const nextSend = (from: Date): Date => {
  const { day, hour, timezone } = schedule.send;
  const want = DAYS.indexOf(String(day).toLowerCase());
  if (want === -1) throw new Error(`send.day is not a day: ${day}`);
  for (let i = 1; i <= 8; i++) {
    const c = new Date(from.getTime() + i * 864e5);
    const local = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(c);
    const g = (t: string) => local.find((p) => p.type === t)!.value;
    if (DAYS.indexOf(g('weekday').toLowerCase()) !== want) continue;
    const at = zoned(Number(g('year')), Number(g('month')) - 1, Number(g('day')), hour, timezone);
    if (at.getTime() > from.getTime()) return at;
  }
  throw new Error('no send day found in the next week');
};

/* ---- choosing the week's book ---- */

const eraOf = (w: Work) => String(w.data.era);
const regionOf = (w: Work) => String(w.data.region);

/**
 * The curated run first, then a rotation over everything left. The rotation holds era and
 * region apart by the configured number of weeks and prefers the works a reader is most
 * likely to finish, so the automatic half does not immediately turn into a wall of the
 * hardest books nobody picked by hand.
 */
const pick = (sent: string[], count: number): Work[] => {
  const out: Work[] = [];
  const taken = new Set(sent);
  const history = [...sent];
  const { era: eraGap, region: regionGap } = schedule.rotation.spacing;
  const needIsbn = schedule.rotation.requireRecommendedIsbn !== false;

  const recent = (n: number) => history.slice(-n).map((s) => works.get(s)).filter(Boolean) as Work[];

  while (out.length < count) {
    const curated = (schedule.curated as string[]).find((s) => !taken.has(s));
    let chosen: Work | undefined;

    if (curated) {
      chosen = works.get(curated);
      if (!chosen) throw new Error(`curated slug has no work file: ${curated}`);
    } else {
      const clashesEra = new Set(recent(eraGap).map(eraOf));
      const clashesRegion = new Set(recent(regionGap).map(regionOf));
      const eligible = [...works.values()].filter((w) =>
        !taken.has(w.slug) &&
        (!needIsbn || w.data.recommendedEdition?.isbn13) &&
        !clashesEra.has(eraOf(w)) &&
        !clashesRegion.has(regionOf(w)));
      /* Easier and shorter first among equals: the rotation should keep feeling like an
         invitation, not a reading list that gets steadily more punishing. */
      chosen = eligible.sort((a, b) =>
        (a.data.difficulty - b.data.difficulty) ||
        (['short', 'medium', 'long', 'epic'].indexOf(a.data.length) - ['short', 'medium', 'long', 'epic'].indexOf(b.data.length)) ||
        a.slug.localeCompare(b.slug))[0];
    }

    if (!chosen) throw new Error('nothing left to send that satisfies the rotation rules');
    out.push(chosen);
    taken.add(chosen.slug);
    history.push(chosen.slug);
  }
  return out;
};

/* ---- rendering ---- */

const paras = (s: string) => s.trim().split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);

/* A guide's body is a flat run of "## " sections, so slicing on the headings is both
   simpler and safer than a lookahead: the last section of the file has no heading after
   it to look ahead to. */
const section = (body: string, heading: string): string => {
  const parts = body.split(/^## /m).slice(1);
  const hit = parts.find((p) => p.split('\n')[0].trim().toLowerCase() === heading.toLowerCase());
  return hit ? hit.split('\n').slice(1).join('\n').trim() : '';
};

/** The "How to read it" section of the guide, which validate-content requires of every work. */
const howToRead = (w: Work, keep: number) => paras(section(w.body, 'How to read it')).slice(0, keep);

const render = (w: Work) => {
  const a = authors.get(String(w.data.author));
  const author = a?.name ?? String(w.data.author);
  const url = `${SITE}/books/${w.slug}/`;
  const ed = w.data.recommendedEdition;
  const quote = (w.data.highlights ?? [])[0];
  const question = section(w.body, 'Questions it raises')
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean)[0];

  const subject = subjectFor(w);
  const by = ed?.translator ? `translated by ${ed.translator}` : ed?.editor ? `edited by ${ed.editor}` : '';
  const buy = amazonUrl(ed?.isbn13, String(ed?.title ?? w.data.title), author);

  const lines: string[] = [
    MARK(w.slug),
    '',
    `## ${w.data.title}`,
    `*${author}, ${w.data.yearDisplay ?? w.data.year}*`,
    '',
    ...paras(String(w.data.whyItMatters ?? '')),
    '',
    '### How to read it',
    '',
    ...howToRead(w, 3),
  ];

  if (ed) {
    lines.push('', '### The edition to get', '');
    lines.push([ed.title ?? w.data.title, by, ed.publisher].filter(Boolean).join(', ') + '.');
    if (ed.why) lines.push('', ed.why);
    lines.push('', `[Find this edition](${buy})`);
  }

  if (quote?.text) {
    lines.push('', '### One passage', '', `> ${quote.text.replace(/\s*\n\s*/g, ' ').trim()}`);
    const credit = [quote.location, quote.translator && `tr. ${quote.translator}`].filter(Boolean).join(', ');
    if (credit) lines.push('', `*${credit}*`);
  }

  if (question) lines.push('', '### A question to sit with', '', question);

  const translated = !!ed?.translator || (w.data.otherEditions ?? []).some((o: any) => o.translator);
  const others = translated ? 'the other translations' : 'the other editions';
  lines.push('', '---', '', `The full guide, with ${others}, the themes and where to read it free, is at [${w.data.title}](${url}).`);

  return { subject, body: lines.join('\n'), slug: w.slug };
};

/**
 * A hand-written emailSubject if the work carries one, else the first sentence of
 * whyItMatters, which is written to be the strongest claim the guide makes and is the one
 * line in the file that already works as a subject. Nothing is invented and nothing is
 * rephrased. If it runs long, or somehow does not name the book, the title carries it.
 */
const subjectFor = (w: Work) => {
  const title = String(w.data.title);
  if (w.data.emailSubject) return String(w.data.emailSubject);
  const sentences = (paras(String(w.data.whyItMatters ?? ''))[0] ?? '')
    .split(/(?<=[.?!])\s/).map((x) => x.replace(/\s*\.$/, '').trim()).filter(Boolean);
  const named = (t: string) => t.toLowerCase().includes(title.toLowerCase());
  /* The opening claim first, then the same claim cut at its colon, then the sentence
     after it. A guide whose every candidate runs long falls back to the title, which is
     dull but never truncated: a subject line cut mid-clause looks like a broken send. */
  const candidates = sentences.slice(0, 2).flatMap((x) => [x, x.split(/[:;]/)[0].trim()]);
  for (const c of candidates) {
    if (!c) continue;
    const full = named(c) ? c : `${title}: ${c}`;
    if (full.length <= 95) return full;
  }
  return `${title}, and why it still gets assigned`;
};

/* ---- Buttondown ---- */

const api = async (path: string, init: RequestInit = {}) => {
  if (!KEY) throw new Error('BUTTONDOWN_API_KEY is not set');
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`Buttondown ${init.method ?? 'GET'} ${path} returned ${r.status}: ${(await r.text()).slice(0, 300)}`);
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
};

/* An email on its way or already gone. A draft is neither: one left lying around would
   otherwise take its work out of the queue and quietly cost that week an email. */
const GONE = new Set(['scheduled', 'about_to_send', 'in_flight', 'sent', 'partially_sent', 'resending', 'throttled']);

/**
 * Put a file in Buttondown's own store and return where it landed.
 *
 * Multipart, so it cannot go through api(): that helper sets a JSON content type, and a
 * multipart body needs fetch to set the header itself so the boundary matches.
 */
const upload = async (path: string): Promise<string> => {
  if (!KEY) throw new Error('BUTTONDOWN_API_KEY is not set');
  const size = statSync(path).size;
  // Their limit, and worth failing on by name rather than as an opaque 400.
  if (size > 1_000_000) throw new Error(`${path} is ${Math.round(size / 1024)}KB, over Buttondown's 1MB limit`);
  const body = new FormData();
  body.append('image', new Blob([readFileSync(path)], { type: 'image/png' }), path.split('/').pop());
  const r = await fetch(`${API}/images`, { method: 'POST', headers: { Authorization: `Token ${KEY}` }, body });
  const text = await r.text();
  if (!r.ok) throw new Error(`upload of ${path} returned ${r.status}: ${text.slice(0, 200)}`);
  /* The field naming has moved between API versions, so take whichever value is a URL
     rather than guessing at the key. */
  const found = Object.values(JSON.parse(text) as Record<string, unknown>)
    .find((v) => typeof v === 'string' && v.startsWith('http'));
  if (typeof found !== 'string') throw new Error(`upload of ${path} returned no URL: ${text.slice(0, 200)}`);
  return found;
};

/** Every work Buttondown has sent or is about to send, in the order it was published. */
const alreadySent = async (): Promise<string[]> => {
  const seen: { slug: string; at: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await api(`/emails?page=${page}`);
    for (const e of r.results ?? []) {
      if (!GONE.has(String(e.status))) continue;
      for (const m of String(e.body ?? '').matchAll(MARK_RE)) seen.push({ slug: m[1], at: e.publish_date ?? e.creation_date ?? '' });
    }
    if (!r.next) break;
  }
  return seen.sort((a, b) => a.at.localeCompare(b.at)).map((s) => s.slug);
};

/*
 * Left alone, Buttondown drops a reader on its own hosted newsletter page the moment they
 * submit, which carries none of this site's branding and offers them a second empty
 * subscribe box. A successful signup then reads as a failed one. These two settings send
 * them to pages here instead: one for the unconfirmed state, one for after they confirm.
 */
const configure = async () => {
  const list = await api('/newsletters');
  const n = (list.results ?? [])[0];
  if (!n?.id) throw new Error('the API key reaches no newsletter');
  const want = {
    subscription_redirect_url: `${SITE}/subscribed/`,
    subscription_confirmation_redirect_url: `${SITE}/welcome/`,
    /* Unset, the confirmation and the weekly email arrive from a bare address with no
       name on them, which is most of what a reader has to judge whether the thing they
       just signed up for is the thing that landed. */
    from_name: 'The Great Books',
    /* Not the confirmation email's subject, however much it wants rewording: customising
       a transactional email needs the Standard plan, and the whole PATCH is refused with
       it in. The sender name above does most of the same work on the free plan. */
    description: 'One great book a week: why it matters, how to read it, and which translation to get.',
  };
  await api(`/newsletters/${n.id}`, { method: 'PATCH', body: JSON.stringify(want) });
  console.log(`Configured ${n.username ?? n.id}:`);
  for (const [k, v] of Object.entries(want)) console.log(`  ${k} = ${v}`);

  /* The seal and the share card.
   *
   * Setting these two to a URL on this site looks like it works: the PATCH is accepted and
   * the field comes back populated, pointing at a Buttondown proxy wrapped around the
   * address given. That proxy then serves nothing, and the newsletter's own page shows a
   * broken image where the seal should be. So the files are uploaded instead, and the
   * fields are set to the address the upload hands back.
   *
   * Sent after the settings above and on its own: these are the fields most likely to be
   * refused, and Buttondown refuses a whole PATCH over one bad field. */
  try {
    const art = {
      icon: await upload('public/brand/newsletter-avatar-600.png'),
      image: await upload('public/og-default.png'),
    };
    await api(`/newsletters/${n.id}`, { method: 'PATCH', body: JSON.stringify(art) });
    for (const [k, v] of Object.entries(art)) console.log(`  ${k} = ${v}`);
  } catch (e) {
    console.log(`  icon and image not set: ${(e as Error).message}`);
    console.log('  upload them by hand at https://buttondown.com/settings');
  }
};

/*
 * Why a signup did or did not produce a confirmation email. Counts and settings only: the
 * answer never depends on whose address it was, and a CI log is a poor place for one.
 */
const diagnose = async () => {
  const n = ((await api('/newsletters')).results ?? [])[0];
  if (!n?.id) throw new Error('the API key reaches no newsletter');
  console.log(`newsletter: ${n.username} (${n.name ?? 'no display name'})`);
  /* Print the newsletter's own scalar settings. Which ones exist moves between API
     versions, and the one that explains a missing email is rarely the one guessed at. */
  const SECRET = /key|token|secret|password/i;
  for (const [k, v] of Object.entries(n).sort())
    if (!SECRET.test(k) && (v === null || ['string', 'number', 'boolean'].includes(typeof v)))
      console.log(`  ${k} = ${v === null || v === '' ? '(unset)' : v}`);

  const states = new Map<string, number>();
  let total = 0, newest = '';
  for (let page = 1; page <= 20; page++) {
    const r = await api(`/subscribers?page=${page}`);
    for (const sub of r.results ?? []) {
      total++;
      const state = String(sub.type ?? sub.subscriber_type ?? 'unknown');
      states.set(state, (states.get(state) ?? 0) + 1);
      const at = String(sub.creation_date ?? '');
      if (at > newest) newest = at;
    }
    if (!r.next) break;
  }
  console.log(`subscribers: ${total}`);
  for (const [state, count] of [...states].sort()) console.log(`  ${state}: ${count}`);
  console.log(`most recent signup: ${newest || '(none)'}`);
  /* An unactivated subscriber is waiting on a confirmation email that Buttondown has
     already sent. A regular one never had to confirm, so no such email exists to miss. */
  if (states.get('unactivated')) console.log('\nAt least one address is unactivated: a confirmation email was sent and is waiting to be clicked.');
  else if (total) console.log('\nNo unactivated addresses: double opt-in is off, so Buttondown sends no confirmation email and a signup is complete at once.');
};

/*
 * The one path nothing else exercises: Thursday's POST. It runs unattended, so a payload
 * Buttondown will not take is a week with no email and nobody watching. This sends the
 * real body as a draft, which is never delivered to anyone, checks it came back, and
 * removes it again, so the state of the account afterwards is the state before it.
 */
const verify = async () => {
  const work = pick(await alreadySent(), 1)[0];
  const email = render(work);
  console.log(`verifying with ${work.slug}, as a draft that is deleted again`);
  const created = await api('/emails', {
    method: 'POST',
    body: JSON.stringify({ subject: email.subject, body: email.body, status: 'draft' }),
  });
  if (!created?.id) throw new Error('Buttondown accepted the email but returned no id');
  try {
    const back = await api(`/emails/${created.id}`);
    const ok = back?.subject === email.subject && String(back?.body ?? '').includes(MARK(work.slug));
    console.log(`  created ${created.id}, status ${back?.status}`);
    console.log(`  subject and body came back ${ok ? 'intact' : 'CHANGED'}`);
    if (!ok) throw new Error('what came back is not what was sent');
  } finally {
    await api(`/emails/${created.id}`, { method: 'DELETE' });
    console.log('  draft deleted');
  }
  const still = await alreadySent();
  console.log(`  queue unaffected: ${still.length} works counted as sent, next is still ${pick(still, 1)[0].slug}`);
  console.log('\nThe Thursday job will work.');
};

/*
 * Resend the confirmation to anyone still unconfirmed. Buttondown does this by itself a
 * day after signup; this is for when the first one went astray and waiting is the only
 * other option.
 */
const nudge = async () => {
  let found = 0;
  for (let page = 1; page <= 20; page++) {
    const r = await api(`/subscribers?page=${page}`);
    for (const sub of r.results ?? []) {
      if (String(sub.type ?? '') !== 'unactivated') continue;
      found++;
      await api(`/subscribers/${sub.id}/send-reminder`, { method: 'POST' });
      console.log(`  reminder sent to subscriber ${sub.id}`);
    }
    if (!r.next) break;
  }
  console.log(found ? `${found} reminder(s) sent.` : 'Nobody is waiting to confirm.');
};

const main = async () => {
  const only = opt('work');
  const weeks = Number(opt('weeks') ?? 1);

  if (flag('configure')) return configure();
  if (flag('diagnose')) return diagnose();
  if (flag('verify')) return verify();
  if (flag('nudge')) return nudge();

  if (DRY) {
    const chosen = only
      ? [works.get(only) ?? (() => { throw new Error(`no work with slug ${only}`); })()]
      : pick([], weeks);
    const when = nextSend(new Date());
    console.log(`# dry run, nothing sent. Next send: ${when.toISOString()} (${schedule.send.day} ${schedule.send.hour}:00 ${schedule.send.timezone})\n`);
    chosen.forEach((w, i) => {
      const e = render(w);
      console.log(`${'='.repeat(72)}\nWEEK ${i + 1}  subject: ${e.subject}\n${'='.repeat(72)}\n${e.body}\n`);
    });
    return;
  }

  const sent = await alreadySent();
  const work = only ? works.get(only) : pick(sent, 1)[0];
  if (!work) throw new Error(`no work with slug ${only}`);
  if (sent.includes(work.slug)) { console.log(`${work.slug} has already gone out. Nothing to do.`); return; }

  const email = render(work);
  const publish = nextSend(new Date());
  const created = await api('/emails', {
    method: 'POST',
    body: JSON.stringify({ subject: email.subject, body: email.body, status: 'scheduled', publish_date: publish.toISOString() }),
  });
  console.log(`Scheduled ${work.slug} for ${publish.toISOString()}: ${created.id ?? '(no id returned)'}`);
};

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
