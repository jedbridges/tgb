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
}

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
  return {
    target: { title: ed?.title ?? work.data.title, author: authorName, isbn13: ed?.isbn13, asin: ed?.asin },
    named: Boolean(ed && (ed.translator || ed.editor || ed.publisher)),
    precise: Boolean(ed?.asin || isbn13ToAsin(ed?.isbn13)),
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
