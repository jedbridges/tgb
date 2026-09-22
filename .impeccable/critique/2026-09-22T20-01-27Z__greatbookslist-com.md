---
target: the entire site
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "url:https://greatbookslist.com/"
timestamp: 2026-09-22T20-01-27Z
slug: greatbookslist-com
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Caveat: the site changed during the run. I removed the "On N lists" card count and
added a mobile menu while both agents were inspecting. Findings below were re-verified
against the current build; none of the five priority issues were affected.

## Design Health Score — 24/40

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The opened 3D book still reads "CLICK THE BOOK TO OPEN IT" and keeps aria-label "Open the cover" after data-state=open. The control lies about its own state. |
| 2 | Match system / real world | 3 | 10 works put an editor in the translator field, so the primary CTA reads "Get the Edited by Edwin Curley translation" on Leviathan, a book written in English. |
| 3 | User control and freedom | 1 | Browse.tsx uses history.replaceState, so filters create no history entries and Back exits the page instead of undoing a filter. The popstate listener is dead code. |
| 4 | Consistency and standards | 3 | hasGuide is passed from exactly 1 of 6 BookCard call sites, so the same book shows a Guide badge on one page and not another. |
| 5 | Error prevention | 2 | countIf() guards on 4 of 11 active facets, so chip counts are wrong whenever difficulty, length, author, region, language or the query is set, and the disable-at-zero guard inherits the blind spot. |
| 6 | Recognition over recall | 2 | Nine H2 sections over 10,408px on mobile with no table of contents, no progress. 327 authors in one native select. |
| 7 | Flexibility and efficiency | 3 | Command palette, deep-linkable state, sort, skip-link. Held back by the missing history entries. |
| 8 | Aesthetic and minimalist | 3 | Home page stacks three taxonomies, 71 links, below a hero that shows no product. |
| 9 | Error recovery | 3 | Empty state is excellent and in voice, but does not say which filter to loosen. |
| 10 | Help and documentation | 2 | /about/ promises "a longer reading guide" for every work. True of 48 of 689, and contradicted by /books/'s own honest lede. |

## Design Specificity Verdict

Roughly 70% authored, 30% category default, and the 30% includes the hero and the
primary Operate surface.

Authored: the shelf is the product's subject used as its interaction model. Spine width
encodes page count, the generated cover invents a house livery so a missing jacket reads
as a uniform edition, and opening a book delivers that work's own first line. The view
transition carries the same object from shelf to page. The token system runs two type
ratios with a written rationale, measures contrast against the darkest surface each ink
sits on, and turns font-synthesis off so a missing weight cannot be faked.

Category-interchangeable: the hero (headline, one support line, two buttons, empty right
half) could belong to any SaaS landing page and is the one surface where the shelf is
absent. The filter rail is a standard e-commerce facet stack. The era bar chart is
dashboard chrome in an editorial page.

Deterministic scan: static markup scan clean (0 findings, 28 files). URL scan found 122
primary across five pages. After triage, most are false positives against this design:
81 wide-tracking all trace to one book-spine rule on vertical small-caps type, counted 3x
through inherited b/i; tight-leading is display type inside generated covers; all-caps-body
is 32-34 character micro-labels the rule exempts; italic-serif-display is the brand.

Real: 4 low-contrast (1.1:1 and 1.3:1 measured), 1 undersized-ui-text at 10.35px, 1
first-viewport-column-overflow. Browser overlays were injected on all five pages and the
live server was stopped.

Clean bill on the technical floor: zero console errors, zero failed requests except one
aborted GA beacon, zero horizontal overflow at 390px, zero focusable elements without a
visible focus ring across 30-40 tab stops per page, LCP 64-380ms, CLS at most 0.0055.

## Overall Impression

The craft is real and in places exceptional, and it is being spent on the wrong surfaces.
The best thing on the site, opening a book to its own first line, is undercut by a label
that never changes and a citation set at 10.35px. The 48 written guides are the entire
moat and they are invisible on five of six surfaces. The single biggest opportunity is
not more polish; it is making the guides findable and fixing a buy button that reads
"Get the Edited by Edwin Curley translation" on the most-assigned book in the catalogue.

## What's Working

1. The 3D book is load-bearing, not decoration. It encodes length, gives coverless works
an identity, delivers primary text on open, and carries the cross-document transition so
the object picked off the shelf is the object that lands.

2. The token system is argued rather than assembled, and it shows: nothing is accidentally
the wrong size or the wrong red, and dark mode worked first try because every colour is
one light-dark() declaration.

3. Editorial honesty is designed rather than disclaimed. The no-edition-recommended state
explains itself, /books/ leads with "48 of them with a written reading guide so far", and
program pages carry their source and check date. For an affiliate site that posture is the
actual moat.

## Priority Issues

P0. The guide badge is absent where it would change a decision and meaningless where shown.
hasGuide is passed from 1 of 6 call sites. On /programs/st-johns/, the highest-intent page,
131 works carry no signal, so a student clicks blind into stubs. On /books/ the badge
appears on nearly every card in the default sort because the 48 guided works are the
most-assigned ones, which trains people to ignore it. Fix: thread hasGuide everywhere, and
invert the mark so the 641 catalogue entries carry a quiet chip instead of accenting the
majority. Suggested: /impeccable clarify

P0. The buy button is ungrammatical on the most-assigned book on the site. 10 works put an
editor in the translator field. Leviathan is assigned by 9 of 9 lists and its CTA reads
"Get the Edited by Edwin Curley translation". Fix: add an editor field with its own copy
branch, migrate the 10, and guard the template against values starting "Edited by" or
ending "(ed.)". Suggested: /impeccable clarify

P1. Filtering is destructive and the counts lie. replaceState means Back exits the page
rather than undoing a filter. countIf guards 4 of 11 facets, so a chip reading 94 can
return 0, and the disable-at-zero guard fails exactly when needed. Fix: pushState for facet
changes, keep replaceState for query keystrokes, and extend countIf to every active facet.
Suggested: /impeccable harden

P1. No buy CTA at the end of a 10,000px guide. BuyButtons renders once, in the hero. The
highest-intent reader on the site is the one who just read 2,500 words and decided to buy,
and the page hands them a shelf of other books. The sticky bar's CTA also degrades to
"Buy the book", discarding the specific edition copy the inline button proves works. Fix:
a second compact BuyButtons before Read next, and make the sticky CTA name the edition.
Suggested: /impeccable clarify

P2. Search excerpts are polluted by the 3D book's decorative text. .work__stage sits inside
data-pagefind-body with no ignore, so cover, title-page and spine text are indexed. Searching
"kant" returns "Critique of JudgmentCritique of Judgmentimmanuel KantImmanuel Kant ... Click
the book to". Fix: data-pagefind-ignore on .work__stage, rebuild, spot-check. Suggested:
/impeccable polish

## Persona Red Flags

First-year student, seminar Thursday: /programs/st-johns/ opens with a 250-word paragraph
and zero books above the fold on the page that is their syllabus. Freshman year reads
DEMANDING nine times in twelve rows, which is discouragement with no discriminating power.
No guide marker, so they learn the site is unreliable on their second click. Nothing
answers "can I do this before Thursday": no reading time, and How to read it is the fifth
H2 at y≈5,747 on mobile.

Arrived from Google on one book: the first thing they read is "Leviathan, translated by
Edited by Edwin Curley". No byline, no price, no format, no indication of what this site is.
The strongest credibility line on the page, "Assigned by 9 of the 9 reading lists", is set
smaller and quieter than the facts table under it.

Lifelong learner on a phone: 125,732px of page, 689 cards, no pagination and no back to top.
Four filters then Back loses everything, and Back is the expected dismiss gesture. Without
JavaScript the page renders completely and filters nothing, and costs 4.6MB in 294 image
requests because the island's hidden-card trick is what suppresses the lazy loads.

## Minor Observations

The epigraph citation computes to 10.35px, below any legibility floor, on the one piece of
primary text the site quotes. Confucius and Laozi are filed under Archaic Greece. Desktop
guide pages end twice, with ~400px of empty left column while the rail finishes. Program
descriptions truncate mid-word. The Prometheus Bound spine renders as AESCHY..S. Era bars
are links with only a hover affordance. Cover thumbnails intermittently fail to load on fast
scroll and do not self-heal. The accent shifts from deep red to pale orange in dark mode, so
the one-red promise is not kept across schemes.

## Questions to Consider

Why is the home page selling three thousand years when the thing nobody else has is
forty-eight essays?

What if the 641 stubs stopped apologising and started asking, with a one-tap request that
tells you which guide to write next?

Is difficulty the wrong axis entirely, when nine of twelve freshman works say DEMANDING?
Hours would discriminate, and it is the number a stressed student actually wants.

What is the shelf metaphor for "I am reading this"? Nine reading lists could be nine
progress bars, with no account and no backend.

Should /books/ even open on 689, rather than on the 48 with guides and an expander?
