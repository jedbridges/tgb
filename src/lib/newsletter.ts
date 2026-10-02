/**
 * The Buttondown username the signup form posts to. Blank hides every signup form.
 *
 * The embed endpoint takes a username, not an id: posting to
 * /embed-subscribe/<uuid> answers "No newsletter with the name of ...", so a form built
 * from one swallows every signup silently. Buttondown shows an id and an API key beside
 * the username in its settings and all three are easy to confuse, so anything shaped like
 * a uuid is treated as unset. That hides the form instead of publishing a dead one, and
 * keeps a key out of the markup if a key is what was pasted.
 */
const raw = (import.meta.env.PUBLIC_BUTTONDOWN_USER as string | undefined)?.trim() || '';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A username sits in a URL path: letters, digits, hyphen and underscore, nothing else. */
const USERNAME = /^[a-z0-9][a-z0-9_-]*$/i;

const usable = raw !== '' && !UUID.test(raw) && USERNAME.test(raw);

if (raw !== '' && !usable) {
  console.warn(
    `[newsletter] PUBLIC_BUTTONDOWN_USER is not a Buttondown username, so every signup form is hidden. ` +
      `It wants the handle from buttondown.com/<username>, not the newsletter id or an API key.`,
  );
}

export const NEWSLETTER_USER = usable ? raw : '';
