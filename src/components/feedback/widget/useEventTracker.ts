import { useCallback, useEffect, useRef } from 'react';
import type { FeedbackEvent } from './types';

interface UseEventTrackerReturn {
  startTracking: () => void;
  stopTracking: () => void;
  getEvents: () => FeedbackEvent[];
  getCurrentContext: () => EventContext;
  logCustomEvent: (name: string, detail: Record<string, unknown>) => void;
}

/** Current location context — attached to transcript segments for correlation */
export interface EventContext {
  route: string;
  scrollPercent: number;
  lastClickedElement: string | null;
  lastClickedText: string | null;
  viewportSection: string | null;
}

/**
 * Tracks user navigation, clicks, and scroll position during a feedback session.
 * Every event is timestamped relative to recording start so it can be correlated
 * with voice audio timestamps.
 */
export function useEventTracker(): UseEventTrackerReturn {
  const eventsRef = useRef<FeedbackEvent[]>([]);
  const startTimeRef = useRef<number>(0);
  const isTrackingRef = useRef(false);
  const contextRef = useRef<EventContext>({
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
    scrollPercent: 0,
    lastClickedElement: null,
    lastClickedText: null,
    viewportSection: null,
  });

  // Cleanup refs for listeners
  const cleanupRef = useRef<(() => void) | null>(null);

  const getOffsetMs = useCallback(() => {
    return Date.now() - startTimeRef.current;
  }, []);

  const pushEvent = useCallback(
    (type: FeedbackEvent['type'], data: Record<string, unknown>) => {
      if (!isTrackingRef.current) return;
      eventsRef.current.push({
        offsetMs: getOffsetMs(),
        type,
        data,
      });
    },
    [getOffsetMs],
  );

  /** Build a CSS-ish selector for an element (for action item correlation) */
  const getElementSelector = useCallback((el: Element): string => {
    if (el.id) return `#${el.id}`;

    const parts: string[] = [];
    let current: Element | null = el;
    let depth = 0;

    while (current && depth < 4) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      // Add class names (skip Tailwind utility classes — too noisy)
      const meaningful = Array.from(current.classList).filter(
        (c) => !c.includes(':') && !c.match(/^(p|m|w|h|flex|grid|text|bg|border|rounded|shadow)-/),
      );
      if (meaningful.length > 0) {
        selector += `.${meaningful.slice(0, 2).join('.')}`;
      }
      // Add data-tour or data-testid if present (very useful for correlation)
      const tour = current.getAttribute('data-tour');
      const testId = current.getAttribute('data-testid');
      if (tour) selector += `[data-tour="${tour}"]`;
      else if (testId) selector += `[data-testid="${testId}"]`;

      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }, []);

  const startTracking = useCallback(() => {
    if (typeof window === 'undefined') return;

    startTimeRef.current = Date.now();
    eventsRef.current = [];
    isTrackingRef.current = true;

    // Record initial route
    contextRef.current.route = window.location.pathname;
    pushEvent('route', { path: window.location.pathname, hash: window.location.hash });

    // --- Route change detection ---
    let lastPath = window.location.pathname;
    const routeObserver = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        contextRef.current.route = lastPath;
        pushEvent('route', { path: lastPath, hash: window.location.hash });
      }
    });
    routeObserver.observe(document.body, { childList: true, subtree: true });

    // Also listen to popstate for back/forward
    const onPopState = () => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        contextRef.current.route = lastPath;
        pushEvent('route', { path: lastPath, hash: window.location.hash });
      }
    };
    window.addEventListener('popstate', onPopState);

    // --- Click tracking ---
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target) return;

      // Skip clicks on the feedback widget itself
      if (target.closest('[data-feedback-widget]')) return;

      const selector = getElementSelector(target);
      const text = (target.textContent || '').trim().slice(0, 100);
      const tag = target.tagName.toLowerCase();

      contextRef.current.lastClickedElement = selector;
      contextRef.current.lastClickedText = text || null;

      pushEvent('click', {
        selector,
        tag,
        text,
        href: target instanceof HTMLAnchorElement ? target.href : undefined,
      });
    };
    document.addEventListener('click', onClick, { capture: true });

    // --- Scroll tracking (throttled) ---
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;

        contextRef.current.scrollPercent = percent;

        // Determine which section of the page is visible
        const viewportMid = scrollTop + window.innerHeight / 2;
        const sections = document.querySelectorAll('[data-tour], [data-section], section, main > div');
        let closestSection: string | null = null;
        let closestDist = Infinity;
        sections.forEach((section) => {
          const rect = section.getBoundingClientRect();
          const sectionMid = scrollTop + rect.top + rect.height / 2;
          const dist = Math.abs(viewportMid - sectionMid);
          if (dist < closestDist) {
            closestDist = dist;
            closestSection =
              section.getAttribute('data-tour') ||
              section.getAttribute('data-section') ||
              section.getAttribute('id') ||
              section.tagName.toLowerCase();
          }
        });
        contextRef.current.viewportSection = closestSection;

        pushEvent('scroll', { percent, section: closestSection });
      }, 2000); // Log scroll at most every 2s
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // --- Cleanup function ---
    cleanupRef.current = () => {
      routeObserver.disconnect();
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('scroll', onScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [pushEvent, getElementSelector]);

  const stopTracking = useCallback(() => {
    isTrackingRef.current = false;
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const getEvents = useCallback((): FeedbackEvent[] => {
    return [...eventsRef.current];
  }, []);

  const getCurrentContext = useCallback((): EventContext => {
    return { ...contextRef.current };
  }, []);

  const logCustomEvent = useCallback(
    (name: string, detail: Record<string, unknown>) => {
      pushEvent('custom', { name, ...detail });
    },
    [pushEvent],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return {
    startTracking,
    stopTracking,
    getEvents,
    getCurrentContext,
    logCustomEvent,
  };
}
