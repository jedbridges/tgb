/** Tiny analytics abstraction. Client-side only. GA4 when configured, otherwise no-op. */
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }
export const GA4_ID = import.meta.env.PUBLIC_GA4_ID as string | undefined;
export function track(event: string, params: Record<string, string | number | undefined> = {}) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', event, params);
}
