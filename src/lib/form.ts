/**
 * The form of a work, in seven families, each with a motif borrowed from bookmaking. Used
 * only as a faint texture behind the book on its page and on the endpaper when the cover is
 * opened, so moving between a play and a treatise feels like moving between two bindings.
 */
export type FormFamily = 'verse' | 'stage' | 'argument' | 'record' | 'sacred' | 'story' | 'science';

const FAMILY: Record<string, FormFamily> = {
  epic: 'verse', lyric: 'verse',
  tragedy: 'stage', comedy: 'stage', drama: 'stage',
  dialogue: 'argument', treatise: 'argument', essay: 'argument', 'political-theory': 'argument', economics: 'argument', psychology: 'argument',
  history: 'record', biography: 'record', letters: 'record', 'founding-document': 'record',
  scripture: 'sacred', theology: 'sacred',
  novel: 'story', romance: 'story', satire: 'story',
  science: 'science',
};

export const formFamily = (genre: string): FormFamily => FAMILY[genre] ?? 'argument';
