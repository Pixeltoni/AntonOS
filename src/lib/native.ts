/** Brücke zur iOS-App (Capacitor): System-Mitteilungen, die auch bei geschlossener App kommen. */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { alreadyDelivered, noticeId, type PlannedNotice } from './schedule';

/** Läuft AntonOS gerade als echte App aus dem App Store bzw. TestFlight? */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

const LOG_KEY = 'antonos:geplant';

function readLog(): { tag: string; at: number }[] {
  try {
    const log = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

/** Mitteilungs-Erlaubnis im Format der Web-API */
export async function nativePermission(ask: boolean): Promise<NotificationPermission> {
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (ask && (display === 'prompt' || display === 'prompt-with-rationale')) display = (await LocalNotifications.requestPermissions()).display;
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
  } catch {
    return 'denied';
  }
}

/** Zeigt sofort eine Mitteilung – außer das System hat dieselbe gerade schon geplant gezeigt. */
export async function nativeNotice(title: string, body: string, tag?: string, href = './'): Promise<boolean> {
  if (tag && alreadyDelivered(readLog(), tag, Date.now())) return true;
  if ((await nativePermission(false)) !== 'granted') return false;
  try {
    await LocalNotifications.schedule({ notifications: [{ id: noticeId(tag ?? `${title}|${Date.now()}`), title, body, extra: { href } }] });
    return true;
  } catch {
    return false;
  }
}

/** Ersetzt alle geplanten Mitteilungen durch `plan`. */
export async function replacePlanned(plan: PlannedNotice[]): Promise<void> {
  if (plan.length === 0 && (await nativePermission(false)) !== 'granted') return;
  if ((await nativePermission(plan.length > 0)) !== 'granted') return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (plan.length) {
    await LocalNotifications.schedule({
      notifications: plan.map((p) => ({ id: noticeId(`${p.tag}|${p.at}`), title: p.title, body: p.body, schedule: { at: new Date(p.at), allowWhileIdle: true }, extra: { href: p.href } })),
    });
  }
  // Merken, was geplant ist: Was davon schon gezeigt wurde, meldet das offene AntonOS nicht noch einmal
  const now = Date.now();
  const kept = readLog().filter((l) => l.at <= now && l.at > now - 2 * 86_400_000);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify([...kept, ...plan.map((p) => ({ tag: p.tag, at: p.at }))]));
  } catch {
    // dann eben ohne Merken
  }
}

/** Tippen auf eine Mitteilung öffnet die passende Seite. */
export function onNoticeTap(open: (href: string) => void): () => void {
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const href = (e.notification.extra as { href?: string } | undefined)?.href;
    if (href && href.startsWith('#')) open(href);
  });
  return () => void handle.then((h) => h.remove());
}
