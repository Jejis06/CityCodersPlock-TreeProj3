import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/** Custom event fired after the viewport has been reset (listeners e.g. Leaflet maps recalc their size). */
export const VIEWPORT_RESTORED_EVENT = 'tree-monitor:viewport-restored';

/** Class set on <html> while the app shell must be locked to the screen (see index.css `html.app-locked`). */
const LOCK_CLASS = 'app-locked';

const TEXT_FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isTextField(el: EventTarget | Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(TEXT_FIELD_SELECTOR);
}

/**
 * Brings the window back to (0, 0) and tells maps to re-measure themselves.
 * Safe to call at any time (no-op effects on desktop).
 */
export function resetIosViewport(): void {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.dispatchEvent(new Event(VIEWPORT_RESTORED_EVENT));
}

/**
 * Blurs the focused text field (closing the iPadOS virtual keyboard) and resets the viewport.
 * Call right before submitting a form / closing a modal.
 */
export function dismissKeyboardAndReset(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextField(active)) active.blur();
  resetIosViewport();
  // iPadOS animates the keyboard away; reset again once the animation has finished.
  window.setTimeout(resetIosViewport, 350);
}

/**
 * iPadOS/iOS Safari keeps the page scrolled up (white strip at the bottom, broken touch offsets)
 * after the virtual keyboard closes. This hook:
 *  - locks the app shell to the screen (`html.app-locked`),
 *  - resets scroll on `focusout` of any text field,
 *  - resets scroll when `visualViewport` grows back (keyboard hides) or the orientation changes.
 */
export function useIosKeyboardFix(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(LOCK_CLASS);

    let timer: number | undefined;
    const scheduleReset = () => {
      resetIosViewport();
      window.clearTimeout(timer);
      timer = window.setTimeout(resetIosViewport, 350);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (isTextField(event.target)) scheduleReset();
    };

    const viewport = window.visualViewport;
    let lastHeight = viewport?.height ?? window.innerHeight;
    const onViewportResize = () => {
      const height = viewport?.height ?? window.innerHeight;
      const keyboardHidden = height > lastHeight || !isTextField(document.activeElement);
      lastHeight = height;
      if (keyboardHidden) scheduleReset();
    };

    document.addEventListener('focusout', onFocusOut, true);
    viewport?.addEventListener('resize', onViewportResize);
    window.addEventListener('orientationchange', scheduleReset);

    return () => {
      window.clearTimeout(timer);
      root.classList.remove(LOCK_CLASS);
      document.removeEventListener('focusout', onFocusOut, true);
      viewport?.removeEventListener('resize', onViewportResize);
      window.removeEventListener('orientationchange', scheduleReset);
    };
  }, []);
}

/** Use inside a `<TreeMap>` child: calls `map.invalidateSize()` whenever the viewport has been restored. */
export function useLeafletViewportRestore(): void {
  const map = useMap();
  useEffect(() => {
    const onRestored = () => map.invalidateSize();
    window.addEventListener(VIEWPORT_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(VIEWPORT_RESTORED_EVENT, onRestored);
  }, [map]);
}
