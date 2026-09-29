/** The Buttondown username the signup form posts to. Blank hides every signup form. */
export const NEWSLETTER_USER = (import.meta.env.PUBLIC_BUTTONDOWN_USER as string | undefined)?.trim() || '';
