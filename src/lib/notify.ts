/**
 * Zeigt eine System-Mitteilung – über den Service Worker, wenn AntonOS als App installiert
 * ist (nötig auf dem Handy), sonst direkt im Browser. Gibt false zurück, wenn keine
 * Mitteilung möglich ist (dann zeigt die App einen Hinweis).
 */
export async function notify(title: string, body: string, tag?: string): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, badge: `${import.meta.env.BASE_URL}icons/icon-192.png` });
      return true;
    }
    new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
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
