import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { extendRest, restLeft, restProgress, startRest, type RestTimer } from '../lib/rest';
import { cancelRestNotice, isNativeApp, planRestNotice } from '../lib/native';
import { mmss } from '../lib/focus';
import { notify } from '../lib/notify';
import { success } from '../lib/haptics';
import { chime } from './focus';
import { useToast } from './toast';

const KEY = 'antonos:satzpause';

type RestInfo = Pick<RestTimer, 'exercise' | 'next' | 'goal'>;

interface RestCtx {
  /** Laufende Satzpause oder null */
  timer: RestTimer | null;
  start(seconds: number, info: RestInfo): void;
  /** +30 s (nach dem Ende: neue kurze Pause) */
  extend(seconds?: number): void;
  skip(): void;
}

const Ctx = createContext<RestCtx | null>(null);

export function useRest(): RestCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRest außerhalb des RestProvider');
  return ctx;
}

function load(): RestTimer | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.startAt === 'number' && typeof raw.endAt === 'number' && raw.endAt > Date.now() - 10 * 60_000) {
      return { exercise: '', next: '', goal: '', ...raw };
    }
  } catch {
    // kaputter Eintrag
  }
  return null;
}

/** Aktuelle Zeit, die nur tickt, solange `active` ist (für Countdowns) */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

const noticeBody = (t: RestTimer) => [t.next && `Weiter: ${t.next}`, t.goal && `Ziel: ${t.goal}`].filter(Boolean).join(' · ') || 'Auf zum nächsten Satz!';

/**
 * Satzpause beim Training: läuft global weiter (auch bei geschlossenem Eintragen-Fenster und nach dem Neuladen),
 * meldet sich zum Ende mit Ton, Vibration und – in der iPhone-App – einer System-Mitteilung.
 */
export function RestProvider({ children }: { children: ReactNode }) {
  const { show } = useToast();
  const [timer, setTimer] = useState<RestTimer | null>(load);
  const ref = useRef(timer);
  ref.current = timer;
  /** Für „+30 s“ nach dem Ende */
  const lastInfo = useRef<RestInfo | null>(timer);

  useEffect(() => {
    try {
      if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
      else localStorage.removeItem(KEY);
    } catch {
      // Speicher voll o. Ä.
    }
  }, [timer]);

  // iPhone: Ende beim System anmelden – kommt auch, wenn das Handy gesperrt auf der Bank liegt
  const endAt = timer?.endAt;
  useEffect(() => {
    if (!isNativeApp()) return;
    const t = ref.current;
    if (t) void planRestNotice(t.endAt, 'Satzpause vorbei 🏋️', noticeBody(t));
    else void cancelRestNotice();
  }, [endAt]);

  // Ende erkennen
  useEffect(() => {
    if (endAt === undefined) return;
    let quiet = false;
    const step = () => {
      const t = ref.current;
      if (!t) return;
      const left = t.endAt - Date.now();
      // App ist offen: die System-Mitteilung kurz vorher zurückziehen, hier gibt es Ton und Hinweis
      if (!quiet && left < 1500 && !document.hidden) {
        quiet = true;
        void cancelRestNotice();
      }
      if (left > 0) return;
      ref.current = null;
      setTimer(null);
      if (document.hidden) {
        if (!isNativeApp()) void notify('Satzpause vorbei', noticeBody(t), 'satzpause');
        return;
      }
      if (-left < 3000) {
        chime();
        success();
      }
      if (-left < 10 * 60_000) show(`🏋️ Pause vorbei${t.next ? ` – weiter: ${t.next}` : ''}`, undefined, 6000);
    };
    step();
    const id = setInterval(step, 250);
    return () => clearInterval(id);
  }, [endAt, show]);

  const start = useCallback((seconds: number, info: RestInfo) => {
    const t = startRest(Date.now(), seconds, info);
    lastInfo.current = info;
    ref.current = t;
    setTimer(t);
  }, []);
  const extend = useCallback((seconds = 30) => {
    const now = Date.now();
    setTimer((x) => (x ? extendRest(x, seconds, now) : lastInfo.current ? startRest(now, seconds, lastInfo.current) : null));
  }, []);
  const skip = useCallback(() => {
    ref.current = null;
    setTimer(null);
  }, []);

  const value = useMemo(() => ({ timer, start, extend, skip }), [timer, start, extend, skip]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Countdown der Satzpause mit „+30 s“ und „Überspringen“ */
export function RestBar({ compact }: { compact?: boolean }) {
  const { timer, extend, skip } = useRest();
  const now = useNow(!!timer);
  if (!timer) return null;
  const left = restLeft(timer, now);
  return (
    <div className={`rest-bar ${compact ? 'compact' : ''}`} role="timer" aria-label={`Satzpause, noch ${mmss(left)}`}>
      <div className="rest-top">
        <span className="rest-time">{mmss(left)}</span>
        <span className="rest-label">{compact ? 'Pause' : 'Satzpause'}</span>
        <button type="button" className="rest-btn" onClick={() => extend(30)}>+30 s</button>
        <button type="button" className="rest-btn" onClick={skip}>Überspringen</button>
      </div>
      <div className="rest-track" aria-hidden><i style={{ width: `${restProgress(timer, now) * 100}%` }} /></div>
      {(timer.next || timer.goal) && (
        <div className="rest-next small">
          {timer.next && <span>Als Nächstes: <b>{timer.next}</b></span>}
          {timer.goal && <span className="rest-goal">🎯 {timer.goal}</span>}
        </div>
      )}
    </div>
  );
}
