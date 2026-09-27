/**
 * When each page's content last changed, from git, for the sitemap's lastmod and the
 * dateModified in structured data.
 *
 * One `git log` over the content and page sources gives every file's last commit date in
 * well under a second; the map is built once per build. A page's date is the date of its
 * content, not of its template: a restyled book page has nothing new to read, and a date
 * that moved on 689 pages at once would tell a crawler nothing. With no history (a shallow clone, a tarball) the map is empty and
 * every caller omits the date rather than inventing one; the workflows fetch full history
 * so the deployed site always has real dates.
 */
import { execSync } from 'node:child_process';

let map: Map<string, string> | null = null;

function load(): Map<string, string> {
  if (map) return map;
  map = new Map();
  try {
    const out = execSync('git log --format=%cI --name-only -- src/content src/pages', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    let date = '';
    for (const line of out.split('\n')) {
      if (!line) continue;
      if (/^\d{4}-\d\d-\d\dT/.test(line)) { date = line.slice(0, 10); continue; }
      if (!map.has(line)) map.set(line, date); // the log is newest first, so the first sighting is the latest change
    }
  } catch { /* no git: every date is unknown */ }
  return map;
}

/** ISO date (YYYY-MM-DD) of the newest change among the given source files, or undefined. */
export function lastModified(...files: string[]): string | undefined {
  const m = load();
  let best: string | undefined;
  for (const f of files) { const d = m.get(f); if (d && (!best || d > best)) best = d; }
  return best;
}

export const workFile = (slug: string) => `src/content/works/${slug}.md`;
export const authorFile = (slug: string) => `src/content/authors/${slug}.md`;
export const programFile = (slug: string) => `src/content/programs/${slug}.yaml`;
export const shelfNoteFile = (kind: string, id: string) => `src/content/shelf-notes/${kind}-${id}.md`;
export const taxonomyFile = (kind: string) => `src/content/taxonomies/${kind}.yaml`;

/**
 * The date for a built URL path, used by the sitemap, which only knows the path. Every page
 * kind on the site maps to the files that produce it; anything unrecognised gets no date.
 */
export function lastModifiedForPath(path: string): string | undefined {
  const p = path.replace(/\/$/, '');
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/books\/difficulty\/([^/]+)$/))) return lastModified(shelfNoteFile('difficulties', m[1]), taxonomyFile('difficulties'));
  if ((m = p.match(/^\/books\/length\/([^/]+)$/))) return lastModified(shelfNoteFile('lengths', m[1]), taxonomyFile('lengths'));
  if ((m = p.match(/^\/books\/([^/]+)\/text(?:\/([^/]+))?$/))) {
    // A text page changes with the guide's passages or with the text itself.
    const prefix = `src/content/texts/${m[1]}/`;
    const files = [...load().keys()].filter((f) => f.startsWith(prefix) && (!m![2] || new RegExp(`^${prefix}\\d+-${m![2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.md$`).test(f)));
    return lastModified(workFile(m[1]), ...files);
  }
  if ((m = p.match(/^\/books\/([^/]+)$/))) return lastModified(workFile(m[1]));
  if ((m = p.match(/^\/authors\/([^/]+)$/))) return lastModified(authorFile(m[1]));
  if ((m = p.match(/^\/programs\/([^/]+)$/))) return lastModified(programFile(m[1]));
  if ((m = p.match(/^\/themes\/([^/]+)\/passages$/))) return lastModified(shelfNoteFile('themes', m[1]));
  if ((m = p.match(/^\/(themes|genres|eras)\/([^/]+)$/))) return lastModified(shelfNoteFile(m[1], m[2]), taxonomyFile(m[1]));
  if (p === '/books') return lastModified('src/pages/books/index.astro', 'src/components/browse/Browse.tsx');
  if (p === '/authors') return lastModified('src/pages/authors/index.astro');
  if (p === '/programs') return lastModified('src/pages/programs/index.astro');
  if (p === '' || p === '/') return lastModified('src/pages/index.astro');
  if ((m = p.match(/^\/(about|privacy|disclosure)$/))) return lastModified(`src/pages/${m[1]}.astro`);
  return undefined;
}
