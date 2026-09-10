/**
 * Google Analytics 4 page views for a single-page app.
 *
 * The tag itself is loaded in index.html with `send_page_view: false`, because
 * gtag's automatic page_view fires once on load and never again on a client-side
 * route change — every dashboard navigation would be invisible.
 *
 * Everything here goes through `redactPath` first. Our URLs carry credentials
 * and identifiers: `/share/:token` IS the credential for a public link,
 * `/meeting/:id` names a customer's meeting, and Supabase's password-recovery
 * redirect puts an access token in the URL hash. None of that may be sent to
 * Google, so we report a template path and drop the query string and hash.
 */

const MEASUREMENT_ID = 'G-TPNYWWNCTR';

type Gtag = (...args: unknown[]) => void;

function gtag(...args: unknown[]) {
  const w = window as unknown as { gtag?: Gtag };
  if (typeof w.gtag === 'function') w.gtag(...args);
}

/** `/meeting/<uuid>` → `/meeting/:id`. Never returns anything user-specific. */
export function redactPath(pathname: string): string {
  return pathname
    .replace(/^\/meeting\/[^/]+/, '/meeting/:id')
    .replace(/^\/share\/[^/]+/, '/share/:token')
    .replace(/^\/invite\/[^/]+/, '/invite/:token');
}

let lastLocation: string | null = null;

/**
 * Send one page_view for the current route, and pin the URL GA reports.
 *
 * The `gtag('set')` call matters as much as the event: GA4's enhanced
 * measurement sends its own events (scroll, click, form) and takes their URL
 * straight from `window.location`, which would ship the raw `/share/<token>`
 * despite the redaction below. Setting `page_location` globally overrides that
 * for every subsequent hit, not just this one. Query string and hash are
 * dropped — Supabase's password-recovery redirect puts an access token in the
 * hash.
 */
export function trackPageView(pathname: string, title?: string) {
  const path = redactPath(pathname);
  const location = `${window.location.origin}${path}`;

  // `set` covers the events GA sends by itself (enhanced measurement: scroll,
  // click, history change), which otherwise read window.location directly.
  gtag('set', { page_location: location, page_referrer: lastLocation ?? undefined });
  // Event-level params, because a `set` page_path is not reliably applied to
  // the hit — verified against the real /g/collect payload.
  gtag('event', 'page_view', {
    page_path: path,
    page_location: location,
    page_title: title ?? document.title,
    send_to: MEASUREMENT_ID,
  });

  lastLocation = location;
}
