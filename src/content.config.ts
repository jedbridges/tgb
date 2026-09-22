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
  translator: z.string().optional(),
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
      source: z.enum(['openlibrary', 'generated', 'manual']).default('generated'),
      olid: z.string().optional(),
      coverId: z.number().optional(),
      isbn13: isbn13.optional(),
      credit: z.string().optional(),
    }).default({ source: 'generated' }),
    synopsis: z.string().min(80).max(700),
    whyItMatters: z.string().min(80).max(1200).optional(),
    keyThemes: z.array(z.object({ theme: reference('themes'), note: z.string().max(320) })).default([]),
    highlights: z.array(highlight).max(6).default([]),
    related: z.array(reference('works')).max(6).default([]),
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
      order: z.number().int(),
      items: z.array(programItem).min(1),
    })).min(1),
  }),
});

export const collections = { works, authors, programs, themes, genres, eras, regions, languages };
