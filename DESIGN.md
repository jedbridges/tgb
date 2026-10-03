---
name: The Great Books
description: Warm paper, one red, and books that stand up off it.
colors:
  paper: "light-dark(#f2e8e4, oklch(0.175 0.012 45))"
  paper-deep: "light-dark(oklch(0.905 0.018 45), oklch(0.215 0.014 45))"
  paper-deeper: "light-dark(oklch(0.86 0.022 45), oklch(0.265 0.016 45))"
  paper-bright: "light-dark(oklch(0.965 0.01 55), oklch(0.245 0.014 50))"
  ink: "light-dark(#4b4644, oklch(0.885 0.012 65))"
  ink-strong: "light-dark(oklch(0.31 0.014 40), oklch(0.935 0.01 70))"
  ink-soft: "light-dark(oklch(0.46 0.015 40), oklch(0.76 0.014 55))"
  ink-mute: "light-dark(oklch(0.49 0.014 45), oklch(0.675 0.016 50))"
  accent: "light-dark(oklch(0.50 0.19 37), oklch(0.74 0.17 33))"
  accent-press: "light-dark(oklch(0.42 0.17 35), oklch(0.82 0.14 36))"
  accent-wash: "light-dark(oklch(0.93 0.04 45), oklch(0.29 0.07 35))"
  shelf-wood: "light-dark(oklch(0.42 0.05 45), oklch(0.33 0.045 45))"
  wax: "oklch(0.42 0.17 35)"
  wax-deep: "oklch(0.30 0.13 31)"
  wax-edge: "oklch(0.55 0.19 39)"
typography:
  display:
    fontFamily: "Gambetta, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(3rem, 2.15rem + 4.25vw, 5.25rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Gambetta, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.4rem, 1.85rem + 2.75vw, 3.75rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Gambetta, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(1.8rem, 1.5rem + 1.5vw, 2.625rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Gambetta, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(1.0625rem, 1.01rem + 0.28vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: "Satoshi, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.8125rem, 0.79rem + 0.11vw, 0.875rem)"
    fontWeight: 500
    letterSpacing: "0.14em"
rounded:
  hairline: "2px"
  control: "3px"
  surface: "6px"
  panel: "8px"
  pill: "999px"
spacing:
  "-1": "0.25rem"
  "0": "0.5rem"
  "1": "1rem"
  "2": "1.5rem"
  "3": "2.5rem"
  "4": "clamp(3rem, 2rem + 4vw, 5rem)"
  "5": "clamp(4.5rem, 3rem + 7vw, 9rem)"
  gutter: "clamp(1rem, 4vw, 3.5rem)"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.8em 1.3em"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper-bright}"
    rounded: "{rounded.control}"
    padding: "0.8em 1.3em"
    height: "44px"
  button-accent-hover:
    backgroundColor: "{colors.accent-press}"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.7em 0.9em"
    height: "44px"
  pick-card:
    backgroundColor: "{colors.paper-bright}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.surface}"
    padding: "1.5rem"
  palette-panel:
    backgroundColor: "{colors.paper-bright}"
    rounded: "{rounded.panel}"
    width: "min(100% - 2 * gutter, 42rem)"
---

# Design System: The Great Books

## Overview

**Creative North Star: "The Standing Shelf"**

The books are objects and everything else is the quiet case around them. A page is a warm
sheet of paper with ink on it, ruled by dotted leaders borrowed from a table of contents,
and the only things on it with weight and shadow are the volumes themselves, the shelf they
stand on, and the wax seal. That division is the whole system: chrome recedes to type and
hairlines, and depth is spent exclusively on the things a reader would be able to pick up.

The character is restrained and typographic. Hierarchy is carried by size, by the display
face and by its single heavier cut, never by piling on weight or colour. Headings sit in
the same warm ink as body text rather than reaching for black, because a heading at
eighty-four pixels does not need extra colour to be read as a heading, and taking it toward
black on warm paper turns it into a slab from a different palette.

Both schemes are first-class. Every colour is declared once as `light-dark(light, dark)`,
so there is no second palette to keep in step, and the scheme follows the reader's system
setting until they pin it.

**Key Characteristics:**
- Warm paper and warm ink; nothing is pure black or pure white
- One red, used sparingly, in three states rather than three colours
- Dotted rules for content, solid edges for controls
- Flat chrome, real depth only for objects
- Type set in a serif for reading and a sans for controls, never mixed within a role

## Colors

A warm, slightly pink paper with brown-grey ink and a single oxblood accent, tuned so every
ink value clears a contrast floor against the darkest surface it ever sits on.

### Primary
- **Oxblood** (`oklch(0.50 0.19 37)`, token `--accent`): the only red. Rules, active nav
  underlines, labels, links, buy buttons, caret and focus ring. There used to be a bright
  cut for graphics and a deep cut for text, which made the accent under a nav link and the
  accent in the headline above it visibly different reds on one screen. The deep one won
  because it is the one that clears a contrast floor with words on it.
- **Oxblood Pressed** (`oklch(0.42 0.17 35)`, `--accent-press`): hover and pressed states.
- **Oxblood Wash** (`oklch(0.93 0.04 45)`, `--accent-wash`): selection highlight and tints.

### Neutral
- **Warm Paper** (`#f2e8e4`, `--paper`): the page.
- **Recessed / Backgrounds / Raised Paper** (`--paper-deep`, `--paper-deeper`,
  `--paper-bright`): the tonal ladder that does the work shadows would do elsewhere.
  Raised paper is for cards and the search panel.
- **Brand Ink** (`#4b4644`, `--ink`): body text, headings, outline-button strokes. 7.72:1.
- **Strong Ink** (`oklch(0.31 0.014 40)`, `--ink-strong`): small text that has to carry,
  and emphasis inside prose. 10.98:1.
- **Soft Ink / Muted Ink** (`--ink-soft`, `--ink-mute`): secondary copy and metadata.
  5.38:1 and 4.72:1.

### Tertiary
- **Shelf Wood** (`oklch(0.42 0.05 45)`, `--shelf-wood`) and **Shelf Edge**: the bookcase.
- **Wax** (`oklch(0.42 0.17 35)`), **Wax Deep**, **Wax Edge**: the seal only. Deliberately
  not the accent's dark half, because a stick of sealing wax does not change colour when
  the light does; in the dark scheme it sits on darker paper with a little less chroma.

### Named Rules
**The One Red Rule.** No file mixes its own red. Anything wanting red takes `--accent`,
`--accent-press` or `--accent-wash`. The three are states, not colours.

**The No Black Rule.** Nothing is `#000` or `#fff`. Ink is warm brown-grey, paper is warm
pink-cream, and shadows are cast in `rgb(20 12 8)` in light and pure black only in dark,
where they also work 1.7x harder.

**The Measured Contrast Rule.** Every ink token carries its measured ratio in a comment in
`tokens.css`, taken against `--paper-deep`, the darkest surface it is ever set on, not
against `--paper`. A new ink value is not done until it has a number.

## Typography

**Display Font:** Gambetta (Georgia, Times New Roman, serif)
**Body Font:** Gambetta, same face, at prose sizes
**Label/UI Font:** Satoshi (system-ui, -apple-system, sans-serif)

**Character:** A contemporary serif with a wide lowercase doing both the headings and the
reading, paired with a neutral grotesque that is confined to controls, labels and metadata.
The serif is the voice of the site; the sans is the voice of the machinery.

### Hierarchy
- **Display** (500, `clamp(3rem, 2.15rem + 4.25vw, 5.25rem)`, 1.08, `-0.012em`): page
  titles. A hero-only step above it reaches `6.5rem`.
- **Headline** (500, `clamp(2.4rem, 1.85rem + 2.75vw, 3.75rem)`, 1.2, `-0.015em`): section
  headings.
- **Title** (500, `clamp(1.8rem, 1.5rem + 1.5vw, 2.625rem)`, 1.2): sub-headings and work
  titles. Prose `h2` is set italic.
- **Body** (400, `clamp(1.0625rem, 1.01rem + 0.28vw, 1.1875rem)`, 1.62): running text at a
  58ch measure, which reads as about 70 characters a line. A guide's first paragraph steps
  up to the next size at 1.45 leading and strong ink.
- **Label** (500, `clamp(0.8125rem, 0.79rem + 0.11vw, 0.875rem)`, `0.14em`, uppercase):
  Satoshi, for eyebrow labels and metadata.

### Named Rules
**The Two Ramps Rule.** The interface range steps by about 1.15 and the display range by
about 1.4. One ratio for both put a label, a control and a paragraph within a pixel of each
other and left the page no floor to build on.

**The Shipped Weights Rule.** Gambetta and Satoshi ship 400 and 500; only Satoshi ships
700. `font-synthesis` is off, so asking for a weight that is not there rounds silently.
Nothing may request a weight outside `--w-text`, `--w-emph` and `--w-bold`, and `--w-bold`
is Satoshi only.

**The Italic Display Rule.** Italic is the display face's emphasis, used for section
headings, the wordmark and the signup heading. Bold is not available in it and must not be
faked.

## Layout

A single centred container, `.wrap`, at `min(100% - 2 * gutter, 84rem)` with a gutter that
grows from 1rem to 3.5rem. Prose is constrained separately to a 58ch measure, so a wide
page and a readable paragraph are two different widths rather than one compromise.

Spacing is a seven-step scale from 0.25rem to a fluid 9rem, with the two largest steps
fluid so section rhythm opens up on a desktop without a breakpoint. The header's height is
a token (`4.75rem`, stepping to `4rem` under 1180px and `3.5rem` under 760px) and every
sticky offset on the site derives from it, because those offsets were once written by hand
in five files and changing the bar left panels pinned underneath it.

Shelf and catalogue pages use a card grid with a progressive-reveal sentinel. The browse
page reorders on a phone to search, count and sort, filters, then results.

## Elevation & Depth

**Depth means object.** Content surfaces are flat and separated by the tonal paper ladder
and dotted rules. A shadow is reserved for something a reader would be able to pick up: a
book cover, the shelf, the wax seal, and the one panel that genuinely floats. Everything
else, including every section, every list and every form, is flat at rest.

Shadows are cast in a warm ink token rather than black, and both the colour and the
strength change with the scheme: `rgb(var(--shadow-ink) / calc(X * var(--shadow-a)))`,
where the ink goes to pure black and the multiplier to 1.7 in dark, because a shadow has to
work harder against a dark page.

### Shadow Vocabulary
- **Card at rest** (`0 1px 0 var(--edge), 0 12px 30px -18px rgb(var(--shadow-ink) / calc(0.35 * var(--shadow-a)))`):
  a raised pick or card. The first layer is a hairline, not a glow.
- **Card lifted** (`0 1px 0 var(--edge), 0 18px 34px -16px ... 0.45 ...`): paired with
  `translateY(-2px)` on hover.
- **Floating panel** (`0 30px 80px -20px ... 0.5 ..., 0 0 0 1px var(--edge)`): the search
  palette, over a 4px backdrop blur.
- **Shelf** (`0 6px 12px -4px ... 0.35 ...` plus an inset top highlight): the bookcase.
- **Inset underline** (`inset 0 -3px 0 var(--accent)`): the current nav item; the same
  shape in `--edge` on hover.

### Named Rules
**The No Filter Rule.** There is no SVG `filter` element in the seal markup and nothing
inside it animates. The two together once held Safari at six frames a second, because an
SVG filter with something moving inside it re-runs on the CPU every frame. The smoke test
fails the build if a filter reappears there.

## Shapes

Corners are small and consistent: 2px on focus rings, 3px on buttons and inputs, 6px on
cards, 8px on the floating panel, and a full pill on chips and scrollbar thumbs. Nothing
uses a large radius; the form language is printed matter, not software.

Edges come in two families and the distinction is load-bearing. **Dotted rules**
(`--rule`, `--rule-section`) separate content and are borrowed from the leaders in a table
of contents. **Solid edges** (`--edge`, `--edge-strong`) belong to structure: the header,
inputs, buttons and focus rings. A control whose box is its only identity takes the strong
one; a box that merely groups already-legible text takes the light one.

The seal is the one organic shape in the system: an irregular wax outline generated from
fixed harmonics, never a circle.

## Components

### Buttons
- **Shape:** 3px corners, 44px minimum height, `0.8em 1.3em` padding.
- **Default:** outline. 1px solid `--ink`, transparent fill, ink text, Satoshi at 700.
- **Primary:** `.btn--accent`, filled `--accent` with `--paper-bright` text.
- **Hover / Active:** the outline button inverts to an ink fill with paper text; the accent
  button deepens to `--accent-press`. Both press down 1px on `:active`.
- There is **no ink-filled variant**. An action is either the accent or it is an outline.
  The home page once filled its button with ink while every buy button was red, so the
  page's headline and the page's action disagreed about what the accent was for.

### Chips
- **Style:** full pill, 1px `--edge`, transparent fill, Satoshi at `--step--2`, 500, with
  `0.04em` tracking and a 44px target.
- **State:** border and background shift on hover; used for taxonomy links and filters.

### Cards
- **Corner:** 6px. **Background:** `--paper-bright`. **Border:** a hairline as the first
  shadow layer rather than a border property. **Padding:** `--s2`.
- **Shadow:** card at rest, lifting on hover with a 2px rise.

### Inputs
- **Style:** 3px corners, 1px solid edge, transparent or bright paper fill, Satoshi at
  `--step--1`, 44px minimum height.
- **Focus:** the global ring, never a custom glow.
- **Caret:** `--accent`, everywhere.

### Navigation
- Satoshi, ink, with an inset 3px underline in `--edge` on hover and `--accent` for
  `aria-current="page"`. The header collapses to a drawer below the mobile breakpoint, and
  its height is the token every sticky element reads.

### The Seal
The signature component. Wax poured and struck, drawn from one geometry module that feeds
the SVG fallback, the WebGL relief and the generated share images alike, so there is no
second copy to drift. The SVG that ships in the HTML is complete on its own: a reader with
no JavaScript, no WebGL, a lost context, a print dialog or forced colours gets a finished
seal rather than a hole. Under forced colours it removes itself entirely rather than
becoming a solid shape in somebody else's palette.

### Focus
2px solid `--accent`, 3px offset, 2px radius, on every interactive element. One treatment,
no exceptions.

## Do's and Don'ts

### Do:
- **Do** take red from `--accent`, `--accent-press` or `--accent-wash`, and nowhere else.
- **Do** declare new colours once as `light-dark(light, dark)` so there is never a second
  palette to maintain.
- **Do** record a measured contrast ratio in a comment beside any new ink value, taken
  against `--paper-deep`.
- **Do** keep interactive targets at 44px and above.
- **Do** separate content with dotted rules and structure with solid edges.
- **Do** derive sticky offsets from `--header-h` and `--stick`.
- **Do** give prose the 58ch measure even when the container is wider.

### Don't:
- **Don't** use pure black or pure white anywhere, including shadows in the light scheme.
- **Don't** request a font weight outside 400, 500 and Satoshi's 700. `font-synthesis` is
  off and a missing weight rounds silently.
- **Don't** put a shadow on a content surface. If it is not an object a reader could pick
  up, it is flat.
- **Don't** add an SVG `filter` to the seal, or animate anything inside it. The smoke test
  fails the build for this and the reason is a measured Safari regression.
- **Don't** introduce a large corner radius. 8px is the ceiling and it belongs to one panel.
- **Don't** add an ink-filled button variant alongside the accent one.
- **Don't** load anything from a third party at page load. Nothing from a vendor is fetched
  until a reader chooses to act.
