export type NotifyResult = 'ok' | 'unsupported' | 'not-allowed' | 'no-worker' | 'error';

/** Wartet höchstens `ms` Millisekunden auf einen aktiven Service Worker. */
async function activeRegistration(ms: number): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    // Noch keiner da (z. B. direkt nach dem ersten Öffnen) – jetzt anmelden statt auf „load“ zu warten
    if (!existing && import.meta.env.PROD) await navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms));
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } catch {
    return undefined;
  }
}

/** Handy-Browser (Android, iOS) kennen `new Notification()` nicht – dort geht es nur über den Service Worker. */
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Zeigt eine System-Mitteilung – über den Service Worker (nötig auf dem Handy), am Computer
 * notfalls direkt im Browser. Liefert, ob es geklappt hat bzw. woran es lag.
 */
export async function showNotice(title: string, body: string, tag?: string): Promise<NotifyResult> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'granted') return 'not-allowed';
  const icon = `${import.meta.env.BASE_URL}icons/a-192.png`;
  const reg = await activeRegistration(5000);
  if (reg) {
    try {
      await reg.showNotification(title, { body, tag, icon, badge: icon, data: { url: './' } });
      return 'ok';
    } catch {
      return 'error';
    }
  }
  if (isMobile()) return 'no-worker';
  try {
    new Notification(title, { body, tag, icon });
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Wie `showNotice`, aber nur ja/nein (für Erinnerungen, die selbst einen Hinweis zeigen). */
export async function notify(title: string, body: string, tag?: string): Promise<boolean> {
  return (await showNotice(title, body, tag)) === 'ok';
}

/** Verständliche Erklärung, warum eine Mitteilung nicht kam. */
export function notifyProblemText(result: NotifyResult): string {
  switch (result) {
    case 'ok':
      return '';
    case 'unsupported':
      return 'Dieser Browser kann keine Mitteilungen anzeigen. Auf dem iPhone geht es nur, wenn AntonOS über „Zum Home-Bildschirm“ installiert ist.';
    case 'not-allowed':
      return 'Mitteilungen sind nicht erlaubt – bitte in den Einstellungen des Geräts für AntonOS erlauben.';
    case 'no-worker':
      return 'Die App-Funktionen sind noch nicht geladen. Lade AntonOS einmal neu (mit Internet) und teste dann noch einmal.';
    case 'error':
      return 'Das Gerät hat die Mitteilung abgelehnt. Prüfe, ob Mitteilungen für AntonOS bzw. den Browser in den Geräte-Einstellungen an sind.';
  }
}

/** Fragt einmal nach der Erlaubnis für Mitteilungen. */
export async function askNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
