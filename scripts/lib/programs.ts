import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface ProgramItem { work: string; title?: string; author?: string; note?: string; optional?: boolean }
export interface ProgramFile { id: string; name: string; shortName: string; segments: { id: string; label: string; sublabel?: string; order: number; items: ProgramItem[] }[] }

export function readPrograms(dir = 'src/content/programs'): ProgramFile[] {
  return readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => ({ id: f.replace(/\.yaml$/, ''), ...parse(readFileSync(`${dir}/${f}`, 'utf8')) }));
}

/** Author slug from the author string + the work slug's prefix. Deterministic so every script agrees. */
const OVERRIDES: Record<string, string> = {
  'William James': 'william-james', 'Henry James': 'henry-james', 'George Eliot': 'george-eliot', 'T. S. Eliot': 'ts-eliot',
  'W. E. B. Du Bois': 'du-bois', 'Pope Leo XIII': 'leo-xiii', 'Al-Farabi': 'al-farabi', 'Al-Ghazali': 'al-ghazali',
  'Karl Marx and Friedrich Engels': 'marx', 'Jean-Jacques Dessalines': 'dessalines', 'Paul the Apostle': 'paul',
  'Anonymous': 'anonymous', 'Various': 'various', 'Bible': 'bible', 'Charles W. Eliot': 'charles-eliot',
  'Thomas Aquinas': 'aquinas', 'Augustine': 'augustine', 'Homer': 'homer', 'Plato': 'plato', 'Aristotle': 'aristotle',
  'Percy Bysshe Shelley': 'percy-shelley', 'Mary Shelley': 'mary-shelley', 'John of Damascus': 'john-damascene', 'Pope John Paul II': 'john-paul-ii',
  'Abraham Lincoln and Stephen A. Douglas': 'lincoln', 'Ibn Arabi': 'ibn-arabi', 'Ibn Tufayl': 'ibn-tufail', 'Ibn Khaldun': 'ibn-khaldun',
  'John Asafu-Adjaye et al.': 'asafu-adjaye', 'French National Assembly': 'french-national-assembly',
  'The Pre-Socratic Philosophers': 'presocratics', 'Continental Congress': 'continental-congress',
  'Alexander Hamilton, James Madison, and John Jay': 'hamilton-madison-jay',
  'Mark Burton and Peter Somerville': 'burton-somerville', 'Francis Beaumont and John Fletcher': 'beaumont-fletcher',
  'Council of Castile': 'council-of-castile', 'Marie de France': 'marie-de-france', 'Julian of Norwich': 'julian-of-norwich',
};
export function authorSlug(author: string | undefined, workSlug: string): string {
  if (author && OVERRIDES[author]) return OVERRIDES[author];
  const first = workSlug.split('-')[0];
  if (!author) return first;
  const tokens = author.replace(/\(ed\.\)/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s-]/g, '').split(/\s+/).filter(Boolean);
  // multi-token prefix first (e.g. "du-bois", "ibn-khaldun")
  const two = workSlug.split('-').slice(0, 2).join('-');
  if (tokens.slice(0, -1).some((t, i) => `${t}-${tokens[i + 1]}` === two)) return two;
  const hit = tokens.find((t) => t === first);
  if (hit) return hit;
  return tokens[tokens.length - 1] || first;
}
