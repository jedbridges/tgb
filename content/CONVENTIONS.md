# Content conventions

## Slugs
- Work slug: `{author-slug}-{short-title-slug}`, lowercase ASCII, hyphens. Author slug is the common English surname or mononym
  (`homer`, `plato`, `aristotle`, `augustine`, `aquinas`, `dante`, `shakespeare`, `tolstoy`, `dostoevsky`, `kant`, `nietzsche`).
  Short title drops articles and subtitles: `homer-iliad`, `plato-republic`, `aristotle-nicomachean-ethics`,
  `augustine-confessions`, `dante-inferno` (when only Inferno is assigned) or `dante-divine-comedy` (whole work),
  `shakespeare-hamlet`, `tolstoy-war-and-peace`, `kant-critique-of-pure-reason`, `marx-communist-manifesto`.
- Anonymous / scripture: `bible-genesis`, `bible-exodus`, `bible-job`, `bible-gospel-of-matthew`, `bible-gospel-of-john`,
  `bible-romans`, `epic-of-gilgamesh`, `beowulf`, `song-of-roland`, `arabian-nights`.
- Multi-part or selected: use the whole-work slug and put the selection in the program item `note`
  ("Books I–IV", "selections"). Only split into separate work slugs when programs commonly assign the parts
  independently (Dante's three canticles; Plato's individual dialogues; Aristotle's individual treatises;
  individual Shakespeare plays; individual Greek tragedies).
- Greek tragedies are one slug per play (`aeschylus-agamemnon`, `sophocles-oedipus-the-king`, `sophocles-antigone`,
  `euripides-medea`). Aeschylus' Oresteia may be `aeschylus-oresteia` when assigned as a trilogy.
- Plato dialogues: `plato-apology`, `plato-crito`, `plato-phaedo`, `plato-symposium`, `plato-meno`, `plato-phaedrus`,
  `plato-gorgias`, `plato-timaeus`, `plato-theaetetus`, `plato-sophist`, `plato-parmenides`, `plato-laws`.
- Aristotle: `aristotle-nicomachean-ethics`, `aristotle-politics`, `aristotle-poetics`, `aristotle-physics`,
  `aristotle-metaphysics`, `aristotle-on-the-soul`, `aristotle-organon` (logic), `aristotle-rhetoric`.

## Program YAML
```yaml
name: St. John's College
shortName: St. John's
kind: college            # college | course | series | list
institution: St. John's College (Annapolis and Santa Fe)
url: https://...
description: >-
  One or two paragraphs.
sourceNote: "Annapolis seminar list 2025-26, https://..., checked 2026-09-21"
segmentLabel: Year        # Year | Course | Volume | Semester | List
order: 1
segments:
  - id: freshman
    label: Freshman
    sublabel: Greeks
    order: 1
    items:
      - work: homer-iliad
        title: The Iliad          # research-time only; dropped once the work file exists
        author: Homer
        note: ""                  # "Books I–IV", "selections"
      - work: aeschylus-oresteia
        title: Oresteia
        author: Aeschylus
```
