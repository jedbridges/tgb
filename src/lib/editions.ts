import { isbn13ToAsin, type BuyTarget } from './affiliates';
import type { Work } from './catalog';

export type Edition = NonNullable<Work['data']['recommendedEdition']>;

export interface EditionInfo {
  target: BuyTarget;
  /** A recommendation only exists if we can name the edition. Otherwise the links are a
   *  search, and saying so is the difference between a recommendation and a guess. */
  named: boolean;
  /** The Amazon link lands on a product page rather than a search. */
  precise: boolean;
  translator?: string;
  editor?: string;
  /** "Lattimore translation", "Norton edition", or null when nothing names it. */
  editionName: string | null;
  /** The shortest label that tells two editions apart: the translator, else the editor, else the publisher. */
  short: string;
  /** What a buy button says: "Get the Lattimore translation", or "Buy this edition" when the
   *  name would not fit on one line. */
  buttonLabel: string;
}

/**
 * The name readers use for a translation is the translator's surname: "the Lattimore", "the
 * Fagles". For a team it is the first of them, and a particle stays with its name, so Aubrey
 * de Sélincourt is "the de Sélincourt translation".
 */
export function surname(name: string): string {
  const first = name.split(/,|;| and | & /)[0].trim().replace(/\s+(Jr\.|Sr\.|II|III)$/, '');
  const words = first.split(/\s+/);
  let i = words.length - 1;
  while (i > 0 && /^(de|du|da|di|del|della|van|von|der|den|la|le|ten|ter)$/.test(words[i - 1])) i--;
  return words.slice(i).join(' ');
}

/** Past this a label wraps to two lines on a phone-width button and stops reading as a button. */
const BUTTON_MAX = 32;

/**
 * What an edition is actually called, in the order that tells a reader the most.
 * For a translated work the translator is most of the decision; for one written in
 * English it is the editor who made the text and the apparatus. A guard catches any
 * editor still sitting in the translator field, so bad data degrades to the right
 * sentence rather than to "translated by Edited by".
 */
export function describeEdition(work: Work, authorName: string, ed: Edition | undefined): EditionInfo {
  const strayEditor = ed?.translator && /^(edited by|ed\.)\s/i.test(ed.translator);
  const translator = strayEditor ? undefined : ed?.translator;
  const editor = ed?.editor ?? (strayEditor ? ed!.translator!.replace(/^(edited by|ed\.)\s+/i, '') : undefined);
  const editionName = translator
    ? `${translator} translation`
    : editor
      ? `${editor} edition`
      : ed?.publisher ? `${ed.publisher} edition` : null;
  const specific = translator
    ? `Get the ${surname(translator)} translation`
    : editor
      ? `Get the ${surname(editor)} edition`
      : ed?.publisher ? `Get the ${ed.publisher.replace(/\s*\(.*?\)/g, '')} edition` : null;
  const precise = Boolean(ed?.asin || isbn13ToAsin(ed?.isbn13));
  const named = Boolean(ed && (ed.translator || ed.editor || ed.publisher));
  // The full name is always printed just above the button, so a short button loses nothing.
  const buttonLabel = precise && specific && specific.length <= BUTTON_MAX
    ? specific
    : precise && named ? 'Buy this edition' : named ? 'Find this edition' : 'Search Amazon';
  return {
    buttonLabel,
    target: { title: ed?.title ?? work.data.title, author: authorName, isbn13: ed?.isbn13, asin: ed?.asin },
    named,
    precise,
    translator,
    editor,
    editionName,
    short: translator ?? editor ?? ed?.publisher ?? ed?.title ?? work.data.title,
  };
}

/** Whether "translation" or "edition" is the right word for this work's choice. */
export const isTranslated = (work: Work) => work.data.language.id !== 'english';

/** A stable, short value for analytics: which edition a click was for. */
export const editionKey = (ed: Edition | undefined) => ed?.isbn13 ?? ed?.asin ?? ed?.translator ?? ed?.publisher ?? 'none';
