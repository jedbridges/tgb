# Growth plan

The living plan for turning the site into affiliate revenue, worked one change a week. Read
this before any growth work and update it at the end of every pass: move what shipped into
the log, and re-rank the backlog against what the numbers said.

This repository is public. The plan and its reasoning live here; the figures do not.
Traffic, clicks and earnings stay in `reports/` (gitignored) and in what is sent to the
owner directly. Never put a number from those sources in this file, a commit or a PR.

## How the site earns

Revenue is a chain, and a change is only worth making if it strengthens a weak link:

1. **Found**: a guide appears in search for a query someone actually types.
2. **Chosen**: the result is clicked over its neighbours (title and description).
3. **Convinced**: the guide answers the question it was found for, and the edition
   recommendation is credible.
4. **Handed off**: the reader clicks a buy link, and it lands on the exact recommended
   edition, not a search page.
5. **Bought**: the retailer closes the sale (out of our hands, except that a product page
   converts far better than a search).

The site is new to search, so link 1 is the constraint for now and most work aims there.
Link 4 is the exception worth doing early: it raises the value of every visit already
arriving, at no cost to anything else.

## What the work may not do

These come from `PRODUCT.md` and bind every pass:

- **Prose stays human-written.** No guide text, biography, shelf note or edition reason is
  generated. Growth work may restructure, template, link and measure existing prose, and
  may prepare research for the owner to write from. It does not write the prose.
- **No invented evidence.** No testimonials, ratings, counts of readers, or endorsements.
- **Count readers, do not follow them.** No new trackers, pixels or vendor scripts.
- **The free texts stay free and whole.**
- **A wrong buy link is worse than a search link.** An ISBN is recorded only when the
  edition is confirmed on title, publisher, translator and year; anything less waits for
  the owner.
- Every change goes through a feature branch, the full checks, and a PR the owner merges.

## Measurement

| Source | What it says | How |
| --- | --- | --- |
| Cloudflare Web Analytics | Real readers, visits, referrers, landing pages | `npm run report` |
| Google Search Console | Queries, impressions, clicks, position, per page | `npm run growth` |
| GA4 `affiliate_click` | Buy clicks by page, placement and retailer | `npm run growth` |
| Amazon Associates, Bookshop | Orders and earnings | The owner, monthly |

`npm run growth` needs a read-only Google service account (below). Each run appends to
`reports/growth.csv` and writes the full detail to `reports/growth-YYYY-MM-DD.json`.

### Measurement setup

A one-time job for the owner, since it happens inside the owner's Google accounts:

1. In Google Cloud, create a project, enable the Google Search Console API, the Google
   Analytics Data API and the Google Analytics Admin API, and create a service account
   with a JSON key. Save the key as
   `~/.config/greatbookslist/google-service-account.json`, outside the repository.
2. In Search Console, add the service account's email under Settings, Users and
   permissions, as **Restricted**.
3. In GA4, add the same email under Admin, Property access management, as **Viewer**.
4. In GA4, under Admin, Custom definitions, register `placement` and `retailer` as
   event-scoped custom dimensions, so buy clicks can be split by where the button sits.

## The weekly pass

Every Monday:

1. Run `npm run report` and `npm run growth`. Compare with the previous rows in
   `reports/traffic.csv` and `reports/growth.csv`.
2. If an improvement PR from an earlier pass is still open, ship nothing new. Report, and
   leave the owner one PR to review rather than a queue.
3. Otherwise take the highest item in the backlog that the numbers still support, build it
   on a `growth/` branch, run `npm run validate:content`, `npx astro check` and
   `npm run build`, and open a PR saying which link in the chain it strengthens and what
   should move if it works.
4. Update this file: the shipped item moves to the log with the date and the metric to
   watch; the backlog is re-ranked. Results with figures go to `reports/growth-log.md`.
5. Send the owner the week's numbers and the PR link. On the first Monday of a month, ask
   for the previous month's Amazon and Bookshop figures and record them in
   `reports/earnings.csv`.

## Backlog

Ranked by expected revenue per hour of work, re-ranked every pass.

1. **Confirm ISBNs for the editions guides already name** (link 4). Works whose
   recommended edition has no ISBN send their buy button to a search page.
   `scripts/find-editions.ts` refuses anything below a near-certain match, which leaves a
   long tail of near misses, many of them anthologies (a Bible book recommended in a
   complete Bible, a short essay in a collected volume). Confirm candidates one at a time
   against Open Library on title, publisher, translator and year; record only confirmed
   ones; list the rest for the owner. Order by traffic once Search Console is connected.
   First pass done (see the log): automatic confirmation against Open Library is nearly
   exhausted, since most remaining works have no catalogue record that matches on every
   field. What is left is a list of near misses, mostly a year apart, for the owner to
   settle by eye. Do not run `verify-editions.ts --apply`: its finder accepts a publisher
   match alone, which can pick a different translation from the same house.
2. **Tighten the edition finder** (link 4). Teach `scripts/verify-editions.ts` the checks
   the first pass needed by hand: the translator and the year must match, the record's
   author must be the guide's author (an edition-title search returned another poet's
   Selected Poems), and e-book formats are refused. Then `--apply` becomes safe to run.
3. **Review suspect existing ISBNs** (link 4). Done for the eleven the verifier flagged
   (see the log). Two remain for the owner: No Exit links a library rebind of the right
   Vintage text, and Death in Venice links the ebook record of the right translation.
   Run the verifier again whenever editions change, since a wrong ISBN can arrive with
   any content edit. Also: covers are drawn from `cover.isbn13`, so a corrected ISBN can
   leave the old edition's cover in place (Pere Goriot, The Red and the Black).
4. **Striking-distance queries** (links 1 and 2). Queries where a guide ranks 5 to 20 are
   the cheapest traffic to win. For each, check the title, the H1, the description and the
   internal links pointing at the page against the query's wording. Needs Search Console.
5. **Shown but not clicked** (link 2). Pages with impressions and almost no clicks: the
   title or description is not answering the query. Templated from existing prose and
   edition data, never newly written. Needs Search Console.
6. **Internal links into pages search already likes** (link 1). Raise the pages with
   impressions from the home page, programme pages and related shelves.
7. **Buy button placement and wording** (link 4). Once clicks split by placement, compare
   the hero button with the edition picks and test changes one at a time. Needs the GA4
   custom dimensions and enough clicks to tell a difference.
8. **Links from other sites** (link 1). The site has none yet, and for a new domain that
   is the largest single factor. Prepare a short list of genuinely relevant places (great
   books communities, programme reading pages, library guides) and what each would find
   useful here. The owner decides and does any outreach; nothing is posted or sent from
   here.
9. **Bing Webmaster Tools** (link 1). IndexNow already tells Bing about changes; verifying
   the site there (an owner task) shows whether pages are actually indexed.
10. **Newsletter signups** (return visits). Once traffic exists, measure signups per guide
   view and test placement.

## Log

Newest first. One line per shipped change: date, PR, the link it targets, the metric to
watch. Outcomes with figures go in `reports/growth-log.md`, not here.

- 2026-10-13: replaced or removed five buy links that sold a different translation, or a
  different book, from the one the guide recommends (handed off). Watch: buy clicks on
  those guides do not fall now that the search fallback replaces a product page.
- 2026-10-13: confirmed ISBNs for eight recommended editions and removed two that sent
  buyers to print-on-demand reprints (handed off). Watch: buy clicks on those ten guides,
  and whether the product-page links convert where the search links did not.
- 2026-10-12: weekly growth report and this plan (measurement). Watch: `npm run growth`
  returns Search Console and GA4 data once the service account exists.
