import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { glob, file } from 'astro/loaders';

const slug = z.string().regex(/^[a-z0-9-]+$/);
const isbn13 = z.string().regex(/^97[89]\d{10}$/);

const taxonomyItem = z.object({
  id: slug,
  label: z.string(),
  description: z.string().max(400).optional(),
  order: z.number().int().optional(),
});

const themes = defineCollection({ loader: file('src/content/taxonomies/themes.yaml'), schema: taxonomyItem });
const genres = defineCollection({ loader: file('src/content/taxonomies/genres.yaml'), schema: taxonomyItem });
const regions = defineCollection({ loader: file('src/content/taxonomies/regions.yaml'), schema: taxonomyItem });
const languages = defineCollection({ loader: file('src/content/taxonomies/languages.yaml'), schema: taxonomyItem });
const eras = defineCollection({
  loader: file('src/content/taxonomies/eras.yaml'),
  schema: taxonomyItem.extend({ start: z.number().int(), end: z.number().int() }),
});
/* Difficulty and length are facts on each work, not references, so these two exist only to
   give each level a page: a slug, a label and the value the work carries. */
const difficulties = defineCollection({
  loader: file('src/content/taxonomies/difficulties.yaml'),
  schema: taxonomyItem.extend({ value: z.number().int().min(1).max(5) }),
});
const lengths = defineCollection({
  loader: file('src/content/taxonomies/lengths.yaml'),
  schema: taxonomyItem.extend({ value: z.enum(['short', 'medium', 'long', 'epic']) }),
});

/*
 * The written part of a shelf page: what the works on it share, where to start and what
 * to read together. One file per theme, era, form, difficulty and length, named
 * kind-id.md, so the page for a shelf with no note yet still builds as a plain grid.
 */
const shelfNotes = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/shelf-notes' }),
  schema: z.object({
    kind: z.enum(['themes', 'genres', 'eras', 'difficulties', 'lengths']),
    shelf: slug,
    startHere: reference('works').optional(),
    startHereNote: z.string().max(240).optional(),
    pairing: z.object({ works: z.array(reference('works')).length(2), note: z.string().max(320) }).optional(),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/authors' }),
  schema: z.object({
    name: z.string(),
    sortName: z.string(),
    aliases: z.array(z.coerce.string()).default([]),
    born: z.number().int().optional(),
    died: z.number().int().optional(),
    floruit: z.string().optional(),
    region: reference('regions'),
    language: reference('languages'),
    era: reference('eras'),
    portrait: z.string().optional(),
    wikidata: z.string().optional(),
    status: z.enum(['stub', 'draft', 'reviewed']).default('stub'),
  }),
});

const highlight = z.object({
  text: z.string().min(12).max(700),
  location: z.string().optional(),
  translator: z.string().optional(),
  note: z.string().max(500).optional(),
});

const edition = z.object({
  title: z.string().optional(),
  /*
   * A translator and an editor are different people doing different jobs, and collapsing
   * them produced the site's worst sentence: "Leviathan, translated by Edited by Edwin
   * Curley", on the one work all nine lists assign, in English, untranslated.
   */
  translator: z.string().optional(),
  editor: z.string().optional(),
  publisher: z.string().optional(),
  year: z.number().int().optional(),
  isbn13: isbn13.optional(),
  asin: z.string().optional(),
  why: z.string().max(400).optional(),
});

const works = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/works' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    originalTitle: z.string().optional(),
    aliases: z.array(z.coerce.string()).default([]),
    author: reference('authors'),
    coauthors: z.array(reference('authors')).default([]),
    year: z.number().int(),
    yearDisplay: z.string().optional(),
    era: reference('eras'),
    region: reference('regions'),
    language: reference('languages'),
    genre: reference('genres'),
    genres: z.array(reference('genres')).default([]),
    themes: z.array(reference('themes')).min(1).max(8),
    difficulty: z.number().int().min(1).max(5),
    length: z.enum(['short', 'medium', 'long', 'epic']),
    pages: z.number().int().optional(),
    isPartOf: reference('works').optional(),
    recommendedEdition: edition.optional(),
    otherEditions: z.array(edition).default([]),
    cover: z.object({
      /* 'archive' is a scan of a public-domain edition from the Internet Archive, adopted
         by scripts/find-scans.ts for works no modern jacket could be found for. */
      source: z.enum(['openlibrary', 'generated', 'manual', 'archive']).default('generated'),
      olid: z.string().optional(),
      coverId: z.number().optional(),
      archiveId: z.string().optional(),
      isbn13: isbn13.optional(),
      credit: z.string().optional(),
    }).default({ source: 'generated' }),
    synopsis: z.string().min(80).max(1000),
    whyItMatters: z.string().min(80).max(1400).optional(),
    keyThemes: z.array(z.object({ theme: reference('themes'), note: z.string().max(320) })).default([]),
    highlights: z.array(highlight).max(6).default([]),
    related: z.array(reference('works')).max(6).default([]),
    /* Overrides the weekly email's subject line, which is otherwise cut from the opening
       of whyItMatters. Worth setting where that opening is a long sentence the knife
       cannot find a clause in, which is most of the ones that run past 95 characters. */
    emailSubject: z.string().max(95).optional(),
    keywords: z.array(z.coerce.string()).default([]),
    status: z.enum(['stub', 'draft', 'reviewed', 'published']).default('stub'),
    updated: z.coerce.date().optional(),
  }),
});

const programItem = z.object({
  work: reference('works'),
  title: z.string().optional(),   // research-time convenience; ignored at render
  author: z.string().optional(),
  note: z.string().max(240).optional(),
  optional: z.boolean().default(false),
});

const programs = defineCollection({
  loader: glob({ pattern: '*.yaml', base: 'src/content/programs' }),
  schema: z.object({
    name: z.string(),
    shortName: z.string(),
    /** Other names a reader types for the program: the college, an acronym, a course name. */
    aliases: z.array(z.string()).default([]),
    kind: z.enum(['college', 'course', 'series', 'list']),
    institution: z.string().optional(),
    url: z.string().url().optional(),
    description: z.string(),
    sourceNote: z.string(),
    segmentLabel: z.string(),
    order: z.number().int(),
    segments: z.array(z.object({
      id: slug,
      label: z.string(),
      sublabel: z.string().optional(),
      /** A sentence or two on what the year or course is for. Indexed, and the text under the heading a search engine reads. */
      description: z.string().max(600).optional(),
      order: z.number().int(),
      items: z.array(programItem).min(1),
    })).min(1),
  }),
});

/*
 * The texts themselves, for the works whose originals or older translations are public
 * domain. One file per section (a book of the Odyssey, an act and scene, a chapter), written
 * by scripts/fetch-texts.ts from Standard Ebooks or Project Gutenberg and never by hand, so
 * a section can be regenerated without losing anything. The id is work/section.
 */
const texts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/texts' }),
  schema: z.object({
    work: reference('works'),
    section: slug,
    heading: z.string(),
    order: z.number().int(),
    source: z.enum(['standardebooks', 'gutenberg']),
    sourceUrl: z.string().url(),
    edition: z.string(),
    translator: z.string().optional(),
    licence: z.string(),
    words: z.number().int(),
  }),
});

/*
 * Where a work can be read free, when the text is not hosted here.
 *
 * Link only: nothing in this file is ever downloaded, which is what keeps it apart from
 * text-sources.yaml. Standard Ebooks and Project Gutenberg have already made the copyright
 * judgement these entries rest on, and both are named so a reader knows where they are
 * going before they click. Written by scripts/write-free.ts from the report that
 * scripts/find-free.ts produces, then corrected by hand.
 */
const freeSources = defineCollection({
  loader: file('src/content/free-sources.yaml'),
  schema: z.object({
    work: reference('works'),
    source: z.enum(['standardebooks', 'gutenberg', 'wikisource', 'archive']),
    url: z.string().url(),
    /** Named the way the hosted texts name theirs: "Samuel Butler's prose translation, 1898". */
    edition: z.string(),
    translator: z.string().optional(),
  }),
});

export const collections = {
  freeSources,
  texts,
  difficulties, lengths, shelfNotes, works, authors, programs, themes, genres, eras, regions, languages };
