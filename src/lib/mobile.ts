/** Handy-Verhalten wie bei einer echten App: kein Zoomen, und offene Fenster halten die Seite dahinter fest. */

/** Alles, was über der Seite liegt und selbst scrollen soll (Fenster, Suche, Handy-Menü) */
export const OVERLAY_SELECTOR = '.modal-backdrop, .spotlight-backdrop, .sidebar.open';

/** Zwei-Finger-Zoom und Doppeltipp-Zoom abschalten (iOS ignoriert dafür „user-scalable=no“). */
export function disableZoom() {
  const stop = (e: Event) => e.preventDefault();
  // Safari meldet Zwei-Finger-Gesten als eigene Ereignisse
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
}

let lockedAt: number | null = null;

/** Seite festhalten: `overflow: hidden` reicht auf dem iPhone nicht, darum wird der Body fixiert. */
function lock() {
  if (lockedAt !== null) return;
  lockedAt = window.scrollY;
  const s = document.body.style;
  s.position = 'fixed';
  s.top = `-${lockedAt}px`;
  s.left = '0';
  s.right = '0';
  s.width = '100%';
  s.overflow = 'hidden';
}

function unlock() {
  if (lockedAt === null) return;
  const y = lockedAt;
  lockedAt = null;
  const s = document.body.style;
  s.position = s.top = s.left = s.right = s.width = s.overflow = '';
  window.scrollTo(0, y);
}

/** Beobachtet die Seite und sperrt das Scrollen dahinter, solange irgendein Fenster offen ist – auch bei künftigen Fenstern. */
export function lockScrollBehindOverlays() {
  let queued = false;
  const check = () => {
    queued = false;
    if (document.querySelector(OVERLAY_SELECTOR)) lock();
    else unlock();
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(check);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  check();
}
