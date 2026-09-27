/**
 * Look up Project Gutenberg numbers for the next batch of texts.
 *
 *   npx tsx scripts/find-texts.ts            every candidate below
 *   npx tsx scripts/find-texts.ts plato      candidates whose slug contains "plato"
 *
 * Asks Gutendex (gutendex.com, a free index of the Gutenberg catalogue) for each
 * candidate and prints the English editions it has, most downloaded first, with the
 * number, the title and the authors as the catalogue gives them. The number goes into
 * src/content/text-sources.yaml by hand, because the catalogue often has several
 * translations and the right one is a judgement: the translator the guide names, or the
 * oldest complete one. Run where gutendex.com is reachable; the build container is not.
 */

interface Candidate { work: string; q: string; note?: string }

const CANDIDATES: Candidate[] = [
  { work: 'plato-phaedo', q: 'phaedo plato', note: 'Jowett' },
  { work: 'plato-crito', q: 'crito plato', note: 'Jowett' },
  { work: 'plato-meno', q: 'meno plato', note: 'Jowett' },
  { work: 'plato-phaedrus', q: 'phaedrus plato', note: 'Jowett' },
  { work: 'plato-gorgias', q: 'gorgias plato', note: 'Jowett' },
  { work: 'plato-timaeus', q: 'timaeus plato', note: 'Jowett' },
  { work: 'aristotle-politics', q: 'politics aristotle', note: 'Jowett' },
  { work: 'aristotle-poetics', q: 'poetics aristotle', note: 'Butcher' },
  { work: 'aristotle-physics', q: 'physics aristotle' },
  { work: 'aristotle-metaphysics', q: 'metaphysics aristotle' },
  { work: 'aristotle-on-the-soul', q: 'on the soul aristotle' },
  { work: 'euripides-bacchae', q: 'bacchae euripides', note: 'Murray' },
  { work: 'euripides-hippolytus', q: 'hippolytus euripides', note: 'Murray' },
  { work: 'aristophanes-clouds', q: 'clouds aristophanes' },
  { work: 'aristophanes-birds', q: 'birds aristophanes' },
  { work: 'aristophanes-frogs', q: 'frogs aristophanes' },
  { work: 'sophocles-oedipus-at-colonus', q: 'oedipus at colonus sophocles', note: 'Storr, likely in number 31 with Antigone' },
  { work: 'plutarch-lives', q: 'plutarch lives dryden' },
  { work: 'tacitus-annals', q: 'annals tacitus' },
  { work: 'livy-history-of-rome', q: 'history of rome livy' },
  { work: 'cicero-on-duties', q: 'de officiis cicero' },
  { work: 'augustine-city-of-god', q: 'city of god augustine', note: 'Dods, two volumes' },
  { work: 'aquinas-summa-theologica', q: 'summa theologica aquinas', note: 'several parts; the first will do' },
  { work: 'anselm-proslogion', q: 'proslogium anselm' },
  { work: 'chaucer-canterbury-tales', q: 'canterbury tales chaucer', note: 'a modern English rendering if one is listed' },
  { work: 'machiavelli-discourses-on-livy', q: 'discourses livy machiavelli' },
  { work: 'luther-on-the-freedom-of-a-christian', q: 'freedom of a christian luther' },
  { work: 'bacon-novum-organum', q: 'novum organum bacon' },
  { work: 'shakespeare-macbeth', q: 'macbeth shakespeare' },
  { work: 'descartes-discourse-on-method', q: 'discourse on the method descartes' },
  { work: 'harvey-on-the-motion-of-the-heart-and-blood', q: 'motion of the heart harvey' },
  { work: 'milton-samson-agonistes', q: 'samson agonistes milton' },
  { work: 'racine-phaedra', q: 'phaedra racine' },
  { work: 'leibniz-discourse-on-metaphysics', q: 'discourse on metaphysics leibniz' },
  { work: 'newton-principia', q: 'principia newton motte' },
  { work: 'berkeley-principles-of-human-knowledge', q: 'principles of human knowledge berkeley' },
  { work: 'hume-enquiry-concerning-human-understanding', q: 'enquiry concerning human understanding hume' },
  { work: 'kant-critique-of-pure-reason', q: 'critique of pure reason kant', note: 'Meiklejohn' },
  { work: 'goethe-faust', q: 'faust goethe', note: 'Taylor' },
  { work: 'marx-capital', q: 'capital marx' },
  { work: 'nietzsche-beyond-good-and-evil', q: 'beyond good and evil nietzsche' },
  { work: 'nietzsche-genealogy-of-morals', q: 'genealogy of morals nietzsche' },
  { work: 'woolf-to-the-lighthouse', q: 'to the lighthouse woolf' },
  { work: 'bible-genesis', q: 'king james bible', note: 'the whole Bible; sections chosen with match' },
  { work: 'sappho-poems', q: 'sappho' },
  { work: 'plotinus-enneads', q: 'plotinus' },
  { work: 'euclid-elements', q: 'euclid elements' },
  { work: 'hippocrates-works', q: 'hippocrates' },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const list = CANDIDATES.filter((c) => !only.length || only.some((o) => c.work.includes(o)));

for (const c of list) {
  const url = `https://gutendex.com/books?languages=en&search=${encodeURIComponent(c.q)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log(`${c.work}: ${res.status} from gutendex`); continue; }
    const data = (await res.json()) as { results: { id: number; title: string; authors: { name: string }[]; download_count: number; formats: Record<string, string> }[] };
    const hits = data.results.filter((r) => Object.keys(r.formats).some((f) => f.startsWith('text/html'))).slice(0, 4);
    console.log(`\n${c.work}${c.note ? ` (${c.note})` : ''}`);
    if (!hits.length) { console.log('  nothing in English with an HTML edition'); continue; }
    for (const h of hits) console.log(`  ${String(h.id).padStart(6)}  ${h.title.replace(/\s+/g, ' ').slice(0, 70).padEnd(70)}  ${h.authors.map((a) => a.name).join('; ').slice(0, 50)}`);
  } catch (e) {
    console.log(`${c.work}: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // a polite gap between requests
}
