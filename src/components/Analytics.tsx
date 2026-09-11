import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { syncClarity, trackPageView } from '@/lib/analytics';

/**
 * Sends a GA4 page_view on every route change (including the first render),
 * and starts/stops Clarity session replay so it only ever sees marketing pages.
 * Renders nothing; must live inside the Router.
 */
export function Analytics() {
  const { pathname, hash } = useLocation();

  // Layout effect on purpose: it runs synchronously after React commits the
  // DOM, before the microtask in which Clarity's MutationObserver would see it.
  useLayoutEffect(() => {
    syncClarity(pathname, hash);
  }, [pathname, hash]);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
