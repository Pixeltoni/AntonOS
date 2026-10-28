/** Hilfen für AntonOS als installierte App (PWA). */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Muss früh laufen, damit das Installations-Angebot von Chrome/Edge nicht verloren geht. */
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  }
}

export const onInstallChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const canPromptInstall = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

/** Läuft AntonOS gerade als installierte App (ohne Browser-Leisten)? */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Zahl am App-Symbol (iOS ab 16.4 als App, Android, Windows, macOS) */
export function setBadge(count: number) {
  const nav = navigator as { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => undefined);
    else nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    // nicht unterstützt
  }
}

export interface SharedContent {
  title: string;
  text: string;
  url: string;
}

/**
 * Inhalte aus dem Teilen-Menü (Android/Chrome) kommen als ?title=…&text=…&url=…
 * Viele Apps packen den Link in `text` – dann wird er herausgezogen.
 */
export function parseShared(search: string): SharedContent | null {
  const p = new URLSearchParams(search);
  if (!p.has('title') && !p.has('text') && !p.has('url')) return null;
  let title = (p.get('title') ?? '').trim();
  let text = (p.get('text') ?? '').trim();
  let url = (p.get('url') ?? '').trim();
  if (!url) {
    const m = text.match(/https?:\/\/\S+/);
    if (m) {
      url = m[0];
      text = text.replace(m[0], '').trim();
    }
  }
  if (!title && text && text.length <= 80) {
    title = text;
    text = '';
  }
  if (!title && !text && !url) return null;
  return { title, text, url };
}
