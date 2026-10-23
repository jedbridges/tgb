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

## The agent loop

Three scheduled Claude agents work this plan on the owner's Mac, and the owner acts as
chairman. GitHub issues are the queue between them, so every decision is visible there.

| Role | When | Job |
| --- | --- | --- |
| PM | Mondays | Measures, re-ranks the backlog, keeps at most three `growth` issues labelled `ready`, each with a definition of done and the metric to watch, and writes the chairman's brief |
| Builder | Daily | Takes the top `ready` issue, builds it on a `growth/` branch from a fresh `origin/master`, runs the three checks, opens a PR that closes the issue, labels it `needs-review` |
| Reviewer | Daily, after the builder | Reviews each `needs-review` PR against the rules above and the checks; merges and confirms the deploy and the live page, or labels it `needs-changes` with what to fix |
| Chairman (the owner) | Weekly | Reads the brief, settles issues labelled `chairman`, does what only the owner can: accounts, keys, outreach, and the monthly Amazon and Bookshop figures |

The rules that keep it safe:

- **One change in flight.** The builder does nothing while a growth PR is open.
- **Anything the rules do not settle waits.** An agent unsure whether something is allowed
  labels the issue `chairman` and moves on; nobody acts on it until the owner answers.
- **Nothing leaves the site.** No outreach, posting, emails, new accounts or spending. The
  agents prepare drafts; the owner decides.
- **Stop switch.** A `pause` label on any open issue stops every agent at its next run.
- **Figures stay private.** Issues, PRs and this file are public. Numbers go only in
  `reports/` and in the brief sent to the owner.
- **The checks carry the weight.** Agents reviewing agents share blind spots, so CI, the
  smoke checks and `scripts/verify-editions.ts` are the gate; the reviewer is a second look.

Each week the PM also appends to `reports/growth-log.md` (private) with the figures and how
the last change looks, and on the first Monday of a month asks the owner for the previous
month's Amazon and Bookshop figures for `reports/earnings.csv`.

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
   settle by eye. The finder is now strict enough to run with `--apply` (see the log).
   Open Library often leaves the translator out of print records, so many near misses
   are right and simply unconfirmable there; the retailer's own product page names the
   translator and is the better second source for a human check.
2. **Check that every Amazon product link resolves** (link 4). Of the nine recommended
   ISBNs Open Library called ebooks, seven opened Amazon's "Page Not Found" and one (the
   Qur'an) was a print edition mislabelled. So Open Library's format field cannot be
   trusted either way, and other dead buy buttons may sit among the ISBNs it confirms.
   Visiting hundreds of product pages one by one is not the way; Amazon's Product
   Advertising API answers which ASINs exist in one request per ten. It needs the
   owner's Associates API credentials.
3. **Review suspect existing ISBNs** (link 4). Done for the eleven the verifier flagged
   (see the log). One remains for the owner: No Exit links a library rebind of the right
   Vintage text. Run the verifier again whenever editions change, since a wrong ISBN can
   arrive with any content edit. Covers are drawn from `cover.isbn13`, so a corrected
   ISBN can leave the old edition's cover in place (Pere Goriot, The Red and the Black,
   and the eight ebook replacements).
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

- 2026-10-23: programme page titles keep the words "reading list" for Columbia and Great
  Books of the Western World, which had dropped them for length (search landing). Watch:
  search click-through on those two programme pages.
- 2026-10-21: `verify-editions.ts --checklist` writes the edition near misses to the
  gitignored `reports/edition-checklist.md`, one row each with the guide's edition, the
  catalogue record and plain Amazon and Bookshop product links; `--apply-checklist` writes
  only rows ticked accept. Link: Confirmed (4), the near-miss tail of backlog item 1.
  Watch: works with a product-page buy link once the owner works through the list.

- 2026-10-14: the cover on seven guides showed a different edition from the one the guide
  tells readers to buy; three now show the recommended edition's jacket, and four are back
  to a generated cover (Adam Bede has no image on Open Library; three more had only a scanned
  title page, which `fetch-covers.ts --match-edition` now rejects as mostly pale and
  unsaturated). `validate:content` now fails when `cover.isbn13` and
  `recommendedEdition.isbn13` differ, so it cannot return. Link: the
  reader's trust at the buy click. Watch: buy clicks on those seven guides.
- 2026-10-14: programme pages now name the recommended translation on every row and, where
  the ISBN gives a product page, carry one small Amazon link (placement `program`), so a
  student with a syllabus can buy without opening the guide (handed off). Watch: GA4
  `affiliate_click` with placement `program`, and landings on `/programs/*`.
- 2026-10-14: eight buy buttons opened Amazon's "Page Not Found" (ebook ISBNs). Seven now
  go to the print edition the guide names, confirmed on the product page itself, and
  Arabian Nights falls back to search, since the recommended translation is three volumes
  (handed off). Watch: buy clicks on those guides, which were earning nothing.
- 2026-10-14: edition finder made strict enough to run with `--apply`: translator, year,
  author, print evidence, publisher prefixes, combined volumes and collections all
  checked (handed off). Watch: future ISBN passes need no hand check of each match.
- 2026-10-13: replaced or removed five buy links that sold a different translation, or a
  different book, from the one the guide recommends (handed off). Watch: buy clicks on
  those guides do not fall now that the search fallback replaces a product page.
- 2026-10-13: confirmed ISBNs for eight recommended editions and removed two that sent
  buyers to print-on-demand reprints (handed off). Watch: buy clicks on those ten guides,
  and whether the product-page links convert where the search links did not.
- 2026-10-12: weekly growth report and this plan (measurement). Watch: `npm run growth`
  returns Search Console and GA4 data once the service account exists.
