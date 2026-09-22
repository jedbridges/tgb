/** Single place for affiliate configuration. IDs come from env; blank IDs degrade to plain retailer links. */
const AMAZON_TAG = (import.meta.env.AMAZON_ASSOCIATE_TAG as string | undefined)?.trim() || '';
const BOOKSHOP_ID = (import.meta.env.BOOKSHOP_AFFILIATE_ID as string | undefined)?.trim() || '';

export const affiliatesEnabled = { amazon: !!AMAZON_TAG, bookshop: !!BOOKSHOP_ID };

export interface BuyTarget { title: string; author: string; isbn13?: string; asin?: string }

/**
 * For a printed book Amazon's product id (ASIN) is the ISBN-10, so a 978-prefixed
 * ISBN-13 converts into a direct product-page link. That matters here: a search page
 * lists competing translations, which is precisely what a recommended edition is meant
 * to settle. 979-prefixed ISBNs have no ISBN-10 form and fall back to search.
 */
export function isbn13ToAsin(isbn13?: string): string | undefined {
  if (!isbn13) return undefined;
  const digits = isbn13.replace(/[^0-9]/g, '');
  if (digits.length !== 13 || !digits.startsWith('978')) return undefined;
  const core = digits.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const rem = 11 - (sum % 11);
  const check = rem === 11 ? '0' : rem === 10 ? 'X' : String(rem);
  return core + check;
}

export function amazonUrl(w: BuyTarget): string {
  const asin = w.asin ?? isbn13ToAsin(w.isbn13);
  const base = asin
    ? `https://www.amazon.com/dp/${asin}`
    : w.isbn13
      ? `https://www.amazon.com/s?k=${w.isbn13}&i=stripbooks`
      : `https://www.amazon.com/s?k=${encodeURIComponent(`${w.title} ${w.author}`)}&i=stripbooks`;
  const u = new URL(base);
  if (AMAZON_TAG) { u.searchParams.set('tag', AMAZON_TAG); u.searchParams.set('linkCode', 'll1'); }
  return u.toString();
}

export function bookshopUrl(w: BuyTarget): string {
  if (w.isbn13) return BOOKSHOP_ID ? `https://bookshop.org/a/${BOOKSHOP_ID}/${w.isbn13}` : `https://bookshop.org/book/${w.isbn13}`;
  const q = encodeURIComponent(`${w.title} ${w.author}`);
  return BOOKSHOP_ID ? `https://bookshop.org/search?affiliate=${BOOKSHOP_ID}&keywords=${q}` : `https://bookshop.org/search?keywords=${q}`;
}
