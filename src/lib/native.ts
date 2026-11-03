/** Brücke zur iOS-App (Capacitor): System-Mitteilungen, die auch bei geschlossener App kommen. */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { alreadyDelivered, noticeId, type PlannedNotice } from './schedule';
import type { NativeAlarm } from './alarm';

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

/* ---------- Echter Wecker (AlarmKit, ab iOS 26) – Plugin in ios/App/App/AntonAlarm.swift ---------- */

export type AlarmPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

interface AntonAlarmPlugin {
  status(): Promise<{ state: AlarmPermission }>;
  requestPermission(): Promise<{ state: AlarmPermission }>;
  sync(opts: { alarms: NativeAlarm[] }): Promise<{ state: AlarmPermission; failed: number }>;
  /** `task: false` – Wecker ohne Aufgabe, „Stopp“ schaltet ihn ganz aus */
  ringIn(opts: { seconds: number; id: string; title: string; task?: boolean; snooze?: number; snoozeMax?: number; sound?: string }): Promise<void>;
  solved(): Promise<void>;
  takeStopped(): Promise<{ id?: string; at?: number; snoozes?: number }>;
  /** Eigenes Lied als Weckton (WAV als Base64) in der App speichern bzw. löschen */
  saveSound(opts: { name: string; data: string }): Promise<void>;
  removeSound(opts: { name: string }): Promise<void>;
  addListener(event: 'stopped', fn: () => void): Promise<PluginListenerHandle>;
}

export const AntonAlarm = registerPlugin<AntonAlarmPlugin>('AntonAlarm');

/** Kann diese App echte iPhone-Wecker stellen? (Web und ältere App-Versionen: 'unavailable') */
export async function nativeAlarmPermission(ask: boolean): Promise<AlarmPermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const { state } = await AntonAlarm.status();
    if (ask && state === 'prompt') return (await AntonAlarm.requestPermission()).state;
    return state;
  } catch {
    return 'unavailable';
  }
}

/* ---------- iOS-Widgets – Plugin in ios/App/App/AntonWidgets.swift, Widgets in ios/App/AntonOSWidgets ---------- */

interface AntonWidgetsPlugin {
  /** Legt den Stand für die Widgets ab (JSON), streicht übernommene Aktionen (bis `applied`, ms) und lässt die Widgets neu zeichnen */
  update(opts: { snapshot: string; applied: number }): Promise<void>;
  /** Die im Widget abgehakten Einträge (JSON-Liste) */
  takeActions(): Promise<{ actions: string }>;
  /** Knubbel aus dem gemeinsamen Speicher (ms); leer, wenn noch keiner geschlüpft ist */
  getPet(): Promise<{ born?: number; fed?: number; meals?: number }>;
  setPet(opts: { born: number; fed: number; meals: number }): Promise<void>;
}

export const AntonWidgets = registerPlugin<AntonWidgetsPlugin>('AntonWidgets');

/* ---------- Weitere iPhone-Funktionen – Plugin in ios/App/App/AntonExtras.swift ---------- */

export type NativePermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** Stand des Fokus-Timers für die Live-Aktivität (Sperrbildschirm und Dynamic Island) */
export interface FocusActivityState {
  /** Name des Modus bzw. Kurses, z. B. „Analysis“ */
  label: string;
  /** Modus-Symbol (Emoji) */
  icon: string;
  /** Farbe als #RRGGBB */
  color: string;
  phase: 'fokus' | 'pause' | 'lange-pause';
  /** Beginn und Ende der Phase (ms) */
  startAt: number;
  endAt: number;
  paused: boolean;
  /** Restzeit in Sekunden (für die Anzeige im Pausenzustand) */
  leftSeconds: number;
  round: number;
  rounds: number;
}

/** Aus Siri, Kurzbefehlen oder der Aktionstaste – wartet, bis AntonOS es übernimmt */
export interface NativeIntent {
  kind: 'text' | 'einkauf' | 'fokus' | 'seite';
  text: string;
  at: number;
}

export interface HealthWorkout {
  id: string;
  /** Beginn (ms) */
  start: number;
  minutes: number;
  /** z. B. „Laufen“ */
  type: string;
}

export interface HealthDayValues {
  date: string;
  steps: number;
  sleepMinutes: number;
}

/** Ort mit Mitteilung beim Ankommen bzw. Verlassen */
export interface NativePlaceNotice {
  id: string;
  lat: number;
  lon: number;
  radius: number;
  title: string;
  body: string;
  /** true = beim Verlassen statt beim Ankommen */
  onExit: boolean;
  href: string;
}

interface AntonExtrasPlugin {
  /** Face ID / Touch ID */
  biometry(): Promise<{ kind: 'faceID' | 'touchID' | 'opticID' | 'none' }>;
  authenticate(opts: { reason: string }): Promise<{ ok: boolean }>;
  /** Live-Aktivität starten bzw. aktualisieren (`state`) oder beenden (ohne `state`) */
  focusActivity(opts: { state?: FocusActivityState }): Promise<{ active: boolean }>;
  /** Wartende Einträge aus Siri und Kurzbefehlen (JSON-Liste) – werden dabei gelöscht */
  takeIntents(): Promise<{ items: string }>;
  healthStatus(): Promise<{ state: NativePermission }>;
  healthAuthorize(): Promise<{ state: NativePermission }>;
  healthRead(opts: { days: number }): Promise<{ days: HealthDayValues[]; workouts: HealthWorkout[] }>;
  /** Texterkennung auf dem Gerät (Base64-Bild ohne data:-Vorspann) */
  recognizeText(opts: { image: string }): Promise<{ lines: string[] }>;
  locationStatus(opts: { ask: boolean }): Promise<{ state: NativePermission }>;
  currentLocation(): Promise<{ lat: number; lon: number }>;
  geocode(opts: { address: string }): Promise<{ lat: number; lon: number; name: string }>;
  /** Ersetzt alle Orts-Mitteilungen */
  syncPlaces(opts: { items: NativePlaceNotice[] }): Promise<{ count: number }>;
  addListener(event: 'intent', fn: () => void): Promise<PluginListenerHandle>;
}

export const AntonExtras = registerPlugin<AntonExtrasPlugin>('AntonExtras');

/** Ruft eine Funktion des Plugins auf; in älteren App-Versionen oder im Web: `fallback` */
export async function extras<T>(fn: (p: AntonExtrasPlugin) => Promise<T>, fallback: T): Promise<T> {
  if (!isNativeApp()) return fallback;
  try {
    return await fn(AntonExtras);
  } catch {
    return fallback;
  }
}
