/** Single place for affiliate configuration. IDs come from env; blank IDs degrade to plain retailer links. */
const AMAZON_TAG = (import.meta.env.AMAZON_ASSOCIATE_TAG as string | undefined)?.trim() || '';
const BOOKSHOP_ID = (import.meta.env.BOOKSHOP_AFFILIATE_ID as string | undefined)?.trim() || '';

export const affiliatesEnabled = { amazon: !!AMAZON_TAG, bookshop: !!BOOKSHOP_ID };

export interface BuyTarget { title: string; author: string; isbn13?: string; asin?: string }

export function amazonUrl(w: BuyTarget): string {
  const base = w.asin
    ? `https://www.amazon.com/dp/${w.asin}`
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
