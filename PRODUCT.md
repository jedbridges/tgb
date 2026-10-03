# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adults reading on their own, first. People working through a canon without a course, who
have decided to read a great book and are stuck on the three questions that actually block
them: which book next, which edition or translation, and where to begin inside it.

Students on or applying to a Great Books programme, second. They are not the reader the
guides are written for, but the nine curricula are what makes the site credible, and a
student searching for what St John's or the Columbia Core assigns is a common way in.

## Product Purpose

One place holding every work the major Great Books curricula assign, with a reading guide
for each, a named edition to buy, and the public domain text where one exists.

Success means two things, confirmed by the owner. **Affiliate revenue**: readers buying the
recommended edition through Amazon or Bookshop, which is what pays for the site. And
**being the reference**: the place people link to and come back to for the canon, whether
or not a given visit earns anything. Traffic and subscribers matter as the means to those,
not as the measure.

## Positioning

Nine reading lists reconciled into one catalogue, where every entry carries an opinion.
The guides say which translation to get and why, which specific parts to read if you read
selectively, and what the book is arguing with. A list of titles is easy to copy; 689
guides written to a house standard, each naming an edition and defending the choice, is
not.

The free texts compound it: for 91 works the site holds the whole book, and the guide that
tells you how to read it sits beside it rather than behind a purchase.

## Operating Context

A reader usually arrives from search, on one book, with one question. Most visits are a
single page. That shapes everything: each guide has to answer the question it was found
for without the rest of the site, and the site's one way back to a reader is the weekly
email.

Reading happens off the site as often as on it. The buy link and the translation choice
are the handoff, so they have to be right.

## Capabilities and Constraints

- 689 works, 327 authors, 9 programmes, 71 shelf essays, all in Astro content collections.
- 479 works carry a recommended edition with a real ISBN, so the buy link is a product page
  rather than a search. The rest fall back to search, which is a known gap, not a design.
- 91 works have the complete public domain text on the site, across 2,812 sections.
- Static site on Cloudflare, deployed from master on every push. One Worker, for the
  answer endpoint and the newsletter signup; everything else is a static file.
- Search is Pagefind over the built site. Answers over the site's own writing run through
  Cloudflare AI Search, rate limited because every question is a paid call.
- A weekly email, assembled from the guides rather than written, sent Saturday mornings
  through Buttondown.
- No accounts, no comments, no user-generated content of any kind.
- Editorial rules are enforced by `npm run validate:content`, not by habit: word counts,
  banned phrasing, no em dashes, dangling slug references, and 12-gram duplication between
  guides.

## Brand Commitments

- The name is **The Great Books**; the site is greatbookslist.com.
- The wax seal is the mark. Its geometry lives in one module and every surface that draws
  it, including generated images, reads from there.
- Voice: plain, specific and unhedged. No em dashes anywhere, in content, code or commit
  messages. No sentence that could be about any book. These are enforced, not aspirational.
- Author biographies are one paragraph, 85 to 110 words. Every guide carries Overview, How
  to read it, and Questions it raises.

## Evidence on Hand

Real: the 689 guides and 327 biographies in `src/content`, the nine programme lists, the
2,812 text sections, the recommended editions with their reasons, live Amazon and Bookshop
affiliate accounts.

Absent, and not to be invented: there are no testimonials, no press, no case studies, no
published traffic figures, and no endorsement from any of the nine programmes. The
newsletter has one subscriber, the owner. Any future surface needing social proof has none
to draw on and must not manufacture it.

## Product Principles

1. **Every entry carries an opinion.** A list of titles is a commodity; the recommendation
   and the reason are the product.
2. **Prose stays human-written.** Guides are written and validated, never generated. The
   weekly email assembles existing prose rather than composing new prose, for the same
   reason.
3. **The free texts stay free and whole.** No gate, no truncation, no account.
4. **Count readers, do not follow them.** No accounts, no comments, nothing loaded from a
   vendor until a reader chooses to act.
5. **Each page has to stand alone.** Most visits are one page from search, so a guide
   cannot depend on anything the reader has not seen.

## Accessibility & Inclusion

No external standard has been set, but the incumbent code holds a consistent bar that
future work should not drop below: contrast ratios are recorded against each ink token in
`tokens.css`, interactive targets are held at 44px and above, 22 blocks respond to
`prefers-reduced-motion`, and the seal removes itself under forced colours rather than
becoming a shape in somebody else's palette.
