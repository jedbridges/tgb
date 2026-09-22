# Catalog entry brief

You are writing catalogue entries (frontmatter only, `status: stub`) for works on college Great Books reading lists,
and short author files. Accuracy over flourish. Read before writing:

- `src/content.config.ts` (the schema; every field's type and limits)
- `src/content/taxonomies/*.yaml` (the ONLY allowed ids for era, region, language, genre(s), themes)
- `src/content/works/homer-iliad.md` and `src/content/authors/plato.md` (format exemplars; note your works are stubs, so omit whyItMatters, keyThemes, highlights and the body)
- `content/CONVENTIONS.md`

## Work file: `src/content/works/{slug}.md`

```md
---
title: The Prince
originalTitle: Il Principe          # omit if English
aliases: [De Principatibus]         # other titles/spellings students search; [] if none
author: machiavelli                 # the authorSlug given in the batch
year: 1513                          # composition or first publication; negative = BCE; a single integer
yearDisplay: c. 1513                # only if approximate or a range ("c. 380 BCE", "1265–1274"); use a hyphen not an en dash: "1265-1274"
era: renaissance                    # taxonomy id; must contain `year`
region: italy
language: italian
genre: political-theory             # primary form
genres: [treatise]                  # secondary forms, [] if none
themes: [power-and-authority, virtue, society-and-the-state]   # 2 to 6 ids, most important first
difficulty: 2                       # 1 approachable … 5 formidable, for a strong first-year undergraduate
length: short                       # short <120pp, medium 120-300, long 300-700, epic 700+ (of a standard edition)
pages: 110                          # rough page count of the recommended edition
recommendedEdition:
  title: The Prince
  translator: Harvey C. Mansfield   # omit for English originals
  publisher: University of Chicago Press
  year: 1998
  isbn13: "9780226500447"           # ONLY if you are confident it is the real ISBN-13 of this exact edition. Otherwise omit the line. Never guess digits. Quote it.
  why: Literal and widely assigned; the notes explain Machiavelli's vocabulary.
cover: { source: openlibrary, isbn13: "9780226500447" }   # same isbn if given; else `cover: { source: generated }`
synopsis: >-
  Two to four plain sentences, 200 to 600 characters, that say what the book is and what happens in it or what it argues. Concrete, no praise words.
keywords: [Cesare Borgia, virtù, fortuna]   # characters, places, terms a student would search; up to 8
status: stub
---
```

Rules:
- No em dashes anywhere. Use commas, colons or hyphens.
- `year` is an integer. For scripture and anonymous works give a scholarly composition estimate and a `yearDisplay`.
- `era` must be consistent with `year` (check the era's start/end in eras.yaml).
- For anthologies or "works" entries (e.g. `hippocrates-works`, `stoics-reader`) describe the collection honestly.
- For per-book Bible entries (`bible-genesis` etc.) author is `bible`; for `bible` itself the title is "The Bible".
- Difficulty is about the reading experience for a bright 18-year-old, not the book's importance.
- If a work's programs assign only a part (see the batch `note`s), still describe the whole work.
- Synopsis must be plain text on one YAML folded block (`>-`). No colons at the start of lines, no quotes needed.

## Author file: `src/content/authors/{slug}.md`

```md
---
name: Niccolò Machiavelli
sortName: Machiavelli, Niccolò
aliases: [Machiavel]
born: 1469
died: 1527
region: italy
language: italian
era: renaissance
wikidata: Q1399          # omit if unsure
status: stub
---
```
Use `floruit: "5th century BCE"` instead of born/died when dates are unknown. For `anonymous`, `various`, `bible` use name "Anonymous", "Various authors", "The Bible" with region/language/era of the most representative work. No body text (bios come later).

Write every file in your batch. Do not modify files outside your batch. When done, reply with counts and anything you were unsure about (dates, attributions, ISBNs you omitted).
