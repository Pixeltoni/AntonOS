import { useEffect, useRef, useState, type ReactNode } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { newId, useStore } from '../store';
import type { NativeIntent } from '../lib/native';
import { extras, isNativeApp } from '../lib/native';
import { today } from '../lib/dates';
import { categorize, parseShopping } from '../lib/shopping';
import { activityKey, focusActivityState } from '../lib/liveactivity';
import { restActivityState } from '../lib/rest';
import { defaultHealth, HEALTH_DAYS, mergeHealth } from '../lib/health';
import { placeNotices } from '../lib/places';
import { defaultLock, isLockedPage, RELOCK_MS } from '../lib/lock';
import { useFocus } from './focus';
import { useRest } from './rest';
import { useRoutine } from './routine';
import { routineActivityState } from '../lib/routines';
import { runInAssistant } from './assistant';
import { useToast } from './toast';

/** Gültige Einträge aus der Warteschlange von Siri und Kurzbefehlen */
function parseIntents(raw: string): NativeIntent[] {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((x) => x && typeof x.kind === 'string' && typeof x.text === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Nur in der iPhone-App: Siri und Kurzbefehle übernehmen, den Fokus-Timer als Live-Aktivität
 * zeigen, Apple Health abgleichen und Orts-Erinnerungen beim System anmelden.
 */
export function useNativeExtras() {
  const { data, add, mutate } = useStore();
  const focus = useFocus();
  const { show } = useToast();
  const latest = useRef({ data, focus });
  latest.current = { data, focus };

  /* Siri, Kurzbefehle, Aktionstaste */
  useEffect(() => {
    if (!isNativeApp()) return;
    const take = async () => {
      const { items } = await extras((p) => p.takeIntents(), { items: '[]' });
      for (const it of parseIntents(items)) {
        if (it.kind === 'text') runInAssistant(it.text);
        else if (it.kind === 'einkauf') {
          const list = parseShopping(it.text);
          list.forEach((i) => add('shopping', { name: i.name, amount: i.amount, aisle: categorize(i.name), done: false, added: today() }));
          if (list.length) show(`🛒 ${list.length === 1 ? list[0].name : `${list.length} Sachen`} auf der Einkaufsliste`, { label: 'Ansehen', run: () => (location.hash = '#/einkauf') });
        } else if (it.kind === 'fokus') {
          location.hash = '#/fokus';
          if (!latest.current.focus.timer.running) latest.current.focus.start();
        } else if (it.kind === 'seite' && /^#\/[\w/-]*$/.test(it.text)) location.hash = it.text;
      }
    };
    void take();
    const listener = extras((p) => p.addListener('intent', () => void take()), null);
    const resume = NativeApp.addListener('appStateChange', ({ isActive }) => isActive && void take());
    return () => {
      void listener.then((h) => h?.remove());
      void resume.then((h) => h.remove());
    };
  }, [add, show]);

  /* Fokus-Timer, Routine bzw. Satzpause in der Dynamic Island und auf dem Sperrbildschirm (Satzpause vor Routine vor Fokus) */
  const rest = useRest();
  const routine = useRoutine();
  const course = data.courses.find((c) => c.id === focus.timer.config.courseId);
  const now = Date.now();
  const state = rest.timer
    ? restActivityState(rest.timer, now)
    : (routine.run && routine.routine ? routineActivityState(routine.run, routine.routine, now) : null) ?? focusActivityState(focus.timer, course, now);
  const key = activityKey(state);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!isNativeApp()) return;
    const s = stateRef.current;
    void extras((p) => p.focusActivity(s ? { state: s } : {}), { active: false });
  }, [key]);

  /* Apple Health: beim Öffnen abgleichen (höchstens alle zehn Minuten) */
  const healthOn = !!data.settings.health?.enabled;
  useEffect(() => {
    if (!isNativeApp() || !healthOn) return;
    let last = 0;
    const sync = async () => {
      if (Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      const values = await extras((p) => p.healthRead({ days: HEALTH_DAYS }), null);
      if (!values) return;
      mutate((d) => {
        const settings = { ...defaultHealth(), ...d.settings.health, enabled: true };
        const next = mergeHealth(d, values, settings, newId);
        return { ...next, settings: { ...next.settings, health: { ...settings, lastSync: Date.now() } } };
      });
    };
    void sync();
    const resume = NativeApp.addListener('appStateChange', ({ isActive }) => isActive && void sync());
    return () => void resume.then((h) => h.remove());
  }, [healthOn, mutate]);

  /* Orte: Mitteilungen beim Ankommen nach aktuellem Stand neu anmelden */
  const notices = placeNotices(data, new Date());
  const placesKey = JSON.stringify(notices);
  const hasPlaces = (data.settings.places ?? []).length > 0;
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!isNativeApp() || (!hasPlaces && synced.current === null)) return;
    if (synced.current === placesKey) return;
    const timer = setTimeout(() => {
      synced.current = placesKey;
      void extras((p) => p.syncPlaces({ items: JSON.parse(placesKey) }), { count: 0 });
    }, 2000);
    return () => clearTimeout(timer);
  }, [placesKey, hasPlaces]);
}

/* ---------- Face ID ---------- */

/** Entsperrt bis zur nächsten längeren Pause im Hintergrund */
let unlocked = false;
let hiddenSince = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenSince = Date.now();
    else if (hiddenSince && Date.now() - hiddenSince > RELOCK_MS) unlocked = false;
  });
}

/** Zeigt gesperrte Seiten erst nach Face ID. Entsperrt bleibt es, bis AntonOS eine Minute im Hintergrund war. */
export function LockGate({ page, children }: { page: string; children: ReactNode }) {
  const { data } = useStore();
  const lock = data.settings.lock ?? defaultLock();
  const locked = isNativeApp() && isLockedPage(lock, page);
  const [open, setOpen] = useState(() => !locked || unlocked);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  const unlock = async () => {
    const { ok } = await extras((p) => p.authenticate({ reason: 'Private Bereiche in AntonOS entsperren' }), { ok: false });
    if (ok) {
      unlocked = true;
      setOpen(true);
    } else setFailed(true);
  };

  useEffect(() => {
    if (locked && !open && !asked.current) {
      asked.current = true;
      void unlock();
    }
  });

  // Nach längerer Zeit im Hintergrund wieder sperren
  useEffect(() => {
    if (!locked) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !unlocked) {
        setOpen(false);
        asked.current = false;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [locked]);

  if (!locked || open) return <>{children}</>;
  return (
    <div className="lock-gate">
      <div className="lock-face" aria-hidden>🔒</div>
      <h2>Gesperrt</h2>
      <p className="muted">Mit Face ID entsperren, um diesen Bereich zu sehen.</p>
      {failed && <p className="danger small">Das hat nicht geklappt.</p>}
      <button type="button" className="primary" onClick={() => void unlock()}>Entsperren</button>
    </div>
  );
}

/** Ist ein Bereich gerade gesperrt? (z. B. um ihn aus der Suche herauszuhalten) */
export const isLockedNow = (lock: ReturnType<typeof defaultLock> | undefined, page: string) => isNativeApp() && isLockedPage(lock, page) && !unlocked;
