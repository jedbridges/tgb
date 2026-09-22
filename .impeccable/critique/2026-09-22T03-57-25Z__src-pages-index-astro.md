---
target: the site
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/Users/jedbridges/Documents/GitHub/tgb/src/pages/index.astro"
target_fingerprint: "sha256:1dec0ea2daf99916dea7354176a035cd5fa887f90e06d67a0b373fcd7504d466"
target_path: /Users/jedbridges/Documents/GitHub/tgb/src/pages/index.astro
timestamp: 2026-09-22T03-57-25Z
slug: src-pages-index-astro
---
Method: dual-agent (A: design review, isolated; B: detector and browser evidence, isolated)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | Filter result count sits 172px below the viewport bottom inside a sticky rail that cannot scroll. Filtering gives no observable confirmation. |
| 2 | Match System / Real World | 4 | Shelf, ledge, spine, "On 9 lists", "Click the book to open it". Vocabulary is the domain's own. |
| 3 | User Control and Freedom | 2 | URL state and popstate are right, but "Clear filters" is unreachable and no active-filter pills sit near the results. |
| 4 | Consistency and Standards | 3 | Disciplined tokens, but sidebar labels are h2 styled as 12px eyebrows, and the sticky overflow bug repeats in two places. |
| 5 | Error Prevention | 3 | Good empty state, but only the program facet shows counts, so the other eight invite zero-result combinations. |
| 6 | Recognition Rather Than Recall | 2 | 24 theme chips plus a 327-option author select, and nothing shows which filters are on once you scroll. |
| 7 | Flexibility and Efficiency | 4 | Command-K and slash, shareable filter URLs, five sort presets, per-segment deep links. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained everywhere except the filter rail, which dumps nine facets at once. |
| 9 | Error Recovery | 2 | Search palette shows end users a developer message about running a production build. |
| 10 | Help and Documentation | 3 | About and disclosure are honest and well written, but difficulty and length are never explained where users meet them. |
| **Total** | | **27/40** | **Acceptable. Significant improvements needed.** |

## Design Specificity Verdict

Strongly authored in Persuade and Read mode, category-interchangeable in Operate mode. The product has a real idea and the idea stops at the filter rail.

Product-specific: depth encodes page count, so spine thickness is an information channel; the wooden ledge turns a grid into a bookcase; the cover opens to an epigraph from that work's own highlights; generated typographic covers give 470 coverless works a consistent series livery; program pages read like the syllabus they transcribe.

Interchangeable: header, command palette, and above all the browse surface, which is nine stacked selects and a chip cloud wearing Cormorant Garamond. The site's metaphor is a shelf and its browse experience has no shelf logic at all.

Deterministic scan: one CLI finding, a side-tab accent border at src/pages/books/[slug].astro:187 (the 3px left stripe on "Why it's on the list"). Genuine.

In-page scanning reported 32 findings on the homepage, 2161 on browse, 22 on a work page, 63 on a program page. The 2161 figure is discounted: roughly 2074 are the miniature cover artwork inside the 3D books, set at 7 to 11px by design. The cream-palette rule fires on the brand's paper background and the italic-serif rule on Cormorant headings; both are false positives here. Genuine mechanical signal is the side-tab stripe plus the contrast failures.

Visual overlays: injection succeeded and counts were read from the page. No overlay is viewable now because the session is not open in any window, so the pane cannot composite frames; the overlay server was stopped.

## Overall Impression

Work pages are genuinely good and program pages need almost nothing. The browse page fails at three levels at once: a third of its controls are unreachable, filtering gives no feedback, and it ships a 1.87 MB HTML document. The biggest opportunity is not visual: 641 of 689 pages send buyers to an Amazon keyword search for texts where the translation is the purchase decision, on the one subject where the site knows something Amazon does not.

## What's Working

Depth encodes length: spine thickness is computed from page count, so a reader feels which books are commitments before reading a word. Skeuomorphism carrying data.

Program page composition: number, spine, title, author and year, difficulty right-aligned, thin rules, sticky segment nav. Reads like the document it transcribes, and the decorative spine is correctly out of the tab order.

Editorial honesty as design material: disclosure titled "How this site makes money", stating plainly that links are currently plain links; the disclosure component branches on whether IDs exist rather than pre-claiming Associate status; every program records the date its list was checked.

## Priority Issues

[P0] Both sticky panels are taller than the viewport, so their lower thirds are permanently unreachable. Filter rail measures 1096px in a 900px viewport and pins at top. Sort, difficulty, length, region, language, Clear filters and the result count are all below the fold and scrolling never reveals them. Confirmed in source: neither the rail nor the work sidebar has max-height or overflow-y. A user on a standard laptop cannot sort chronologically at all. Fix: cap both at calc(100dvh - 5.75rem) with overflow-y auto and overscroll-behavior contain, or stick only a compact control bar. Command: /impeccable adapt

[P1] Filtering produces no observable feedback. Clicking a theme chip updates the URL and re-sorts 689 nodes, but both counters are off-screen once scrolled, and the chips overflow the rail by 68px into the grid between roughly 861 and 1150px wide, overlapping covers. Fix: one sticky bar above the grid with live count, removable filter pills and sort; delete the duplicate counter; add min-width 0 to the rail. Command: /impeccable layout

[P1] 641 pages offer a buy button with no edition guidance and a false completeness claim. Stubs have no recommendedEdition so the button falls through to an Amazon keyword search, while the page asserts buy links are complete. This is the revenue model on 93% of pages and the one place the site holds unique knowledge. Fix: require a recommended edition with translator and publisher for every work independent of guide status; put the edition in the button label; rewrite the stub copy. Command: /impeccable clarify

[P1] Duplicate cover images defeat the shelf's only job. The Plato author page renders five cards where three show the identical Five Dialogues cover, repeated again in Read next. Fix: bind an anthology cover only to the anthology's own entry and let individual dialogues fall through to the generated cover. Command: /impeccable polish

[P1] Accessibility gaps the focus system cannot recover from. 741 focusable elements on browse, 12 outside the global focus-visible rule; the nine selects have outline removed, leaving a 1px underline hue change. The accent focus ring is 2.77:1 against paper, below the 3:1 non-text threshold. Muted text fails AA at 2.59:1. The palette declares aria-modal with no focus trap. The work-page book button announces expansion while the revealed content is aria-hidden. Fix: restore focus rings, meet 3:1 on the ring, raise muted text to 4.5:1, trap focus in the palette, remove the false aria-expanded or expose the text. Command: /impeccable audit

[P2] Browse ships a 1.87 MB HTML document with 18,540 elements and no virtualisation: 689 seven-face 3D books across 48,898px of scroll. JS is modest at 33 KB and there are zero console errors on every page checked, so the weight is all markup. Fix: paginate or virtualise, or default the shelf to the 48 guided works. Command: /impeccable optimize

## Persona Red Flags

Jordan, first-timer: the era chart is paper-deep on paper, invisible until hover, with raw counts and no axis. "On 9 lists" is unexplained. Difficulty dots are aria-hidden and the scale is defined nowhere. Arriving on a stub (93% probability from search), Jordan gets no alternative and nothing marks which 48 works have guides. "Open in the browser" asks which browser.

Sam, screen reader and keyboard: 689 card links inside an aria-live polite region that hides, reorders and re-appends every node on each filter change. Card names are triply redundant because the spine text is not hidden. 689 tab stops between rail and footer with no skip-grid link. First focusable element in main on a work page claims to expand and reveals aria-hidden content, and its own instruction is aria-hidden.

Casey, one-handed mobile: at 375px all 28 chips are 26px tall, all nine selects 31px, three nav links 31px, search trigger 32px square. Buy buttons pass at 44.4px. The Filters panel is three screens with no Apply, Done or count in view. Author picker has 327 options. Two books per screen across roughly 138,000px of scroll, no pagination, no back-to-top.

## Minor Observations

Verified shipped bug: the guard hiding spine text on very thin books uses a substring match on the style attribute, so it also matches depths 12 to 19px; every book between roughly 192 and 319 pages silently loses its spine lettering. The accent button class is defined and used nowhere, which is why no page has a primary action that feels primary. The facts row orphans Difficulty alone on a second line at 1440px. The program source note renders as a twelve-line grey paragraph that buries the works count. About and disclosure leave 55% of a wide viewport empty. Theme chips and tag chips share one style, so a theme, a language and a length read as the same class of object.

## Questions to Consider

If 641 of 689 pages are noindex stubs, what is the browse page actually for? Its current job is to distribute users evenly across the weakest content.

The shelf is the product's identity and it shows two books per mobile screen. What if the shelf were the output of a question rather than the default state?

A reading list is something people work through, and nothing lets anyone mark a book read. Would a progress layer on a program page be worth more than 600 more stub pages?

Is a bare keyword-search buy link worse than no button at all, given it teaches users the links are not recommendations, and that lesson then applies to the 48 pages where they are?
