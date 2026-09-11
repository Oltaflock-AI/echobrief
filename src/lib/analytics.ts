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

// ---------------------------------------------------------------------------
// Microsoft Clarity — session replay, marketing pages ONLY.
//
// Clarity records the DOM, not just hits. Inside the app that would ship
// customer transcripts, attendee emails and the share-token URL to Microsoft,
// so the tag is injected only when the visitor is on a public marketing route
// and stopped the moment they navigate anywhere else. It is never loaded when
// the URL carries a hash — Supabase's password-recovery redirect puts the
// access token there. Balanced masking (Clarity's default) hides form inputs
// on /auth; the app shell and the share page additionally carry
// data-clarity-mask as a second layer should a stop ever arrive late.
// ---------------------------------------------------------------------------

const CLARITY_PROJECT_ID = 'ygmbfu5tr7';

const CLARITY_ROUTES = new Set(['/', '/auth', '/privacy', '/privacy-policy', '/terms', '/docs']);

/** True only for public marketing routes with nothing sensitive in the URL. */
export function isClarityRoute(pathname: string, hash = ''): boolean {
  if (hash) return false;
  const p = pathname.replace(/\/+$/, '') || '/';
  return CLARITY_ROUTES.has(p);
}

type Clarity = ((...args: unknown[]) => void) & { q?: unknown[] };

let clarityState: 'unloaded' | 'running' | 'stopped' = 'unloaded';

/**
 * Start Clarity on a marketing route, stop it everywhere else. Idempotent per
 * state, so it is safe to call on every route change. Call it from a layout
 * effect: it must run before Clarity's MutationObserver sees the new page.
 */
export function syncClarity(pathname: string, hash = '') {
  const w = window as unknown as { clarity?: Clarity };
  const allowed = isClarityRoute(pathname, hash);

  if (allowed && clarityState === 'unloaded') {
    // Clarity hooks history.pushState and records the new URL synchronously —
    // before React renders and before any effect can stop it, and that URL is
    // then flushed on stop (verified: a layout-effect stop still shipped the
    // share token). Wrap history first, so our stop runs before Clarity's own
    // hook, which wraps ours, ever sees a non-marketing URL.
    guardHistory();
    // Official loader stub: queue calls until the tag script arrives.
    w.clarity =
      w.clarity ||
      (function (this: unknown) {
        const c = w.clarity as Clarity;
        (c.q = c.q || []).push(arguments);
      } as Clarity);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
    document.head.appendChild(s);
    clarityState = 'running';
  } else if (allowed && clarityState === 'stopped') {
    w.clarity?.('start');
    clarityState = 'running';
  } else if (!allowed && clarityState === 'running') {
    stopClarity();
  }
}

function stopClarity() {
  const w = window as unknown as { clarity?: Clarity };
  w.clarity?.('stop');
  clarityState = 'stopped';
}

let historyGuarded = false;

function guardHistory() {
  if (historyGuarded) return;
  historyGuarded = true;
  const guard = (fn: History['pushState']) =>
    function (this: History, state: unknown, unused: string, url?: string | URL | null) {
      if (url != null && clarityState === 'running') {
        const next = new URL(String(url), window.location.href);
        if (!isClarityRoute(next.pathname, next.hash)) stopClarity();
      }
      return fn.call(this, state, unused, url);
    };
  history.pushState = guard(history.pushState);
  history.replaceState = guard(history.replaceState);
}
