import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { FocusSession } from '../types';
import { today } from '../lib/dates';
import {
  defaultFocusConfig, focusMode, idleTimer, mmss, pause as pauseTimer, phaseMinutes, remainingMs, skip as skipTimer,
  start as startTimer, stop as stopTimer, tick, type FocusConfig, type FocusTimer,
} from '../lib/focus';
import { useToast } from './toast';
import { notify } from '../lib/notify';

const KEY = 'antonos:focus';

interface FocusCtx {
  timer: FocusTimer;
  /** Restzeit der laufenden Phase in ms */
  left: number;
  /** Anteil der Phase, der schon vorbei ist (0–1) */
  progress: number;
  start(): void;
  pause(): void;
  /** Beenden; bei `save` wird die gelernte Zeit gespeichert */
  stop(save: boolean): void;
  skip(): void;
  distract(): void;
  configure(patch: Partial<FocusConfig>): void;
}

const Ctx = createContext<FocusCtx | null>(null);

export function useFocus(): FocusCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFocus außerhalb des FocusProvider');
  return ctx;
}

function load(): FocusTimer {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FocusTimer> | null;
    if (raw && typeof raw === 'object' && raw.config) {
      const config = { ...defaultFocusConfig(), ...raw.config };
      return { ...idleTimer(config), ...raw, config };
    }
  } catch {
    // kaputter Eintrag: frisch anfangen
  }
  return idleTimer();
}

function chime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    [0, 0.18].forEach((delay, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.5);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.55);
    });
    setTimeout(() => ac.close(), 1200);
  } catch {
    // ohne Ton
  }
}

const NEXT_TEXT = { fokus: 'Nächste Runde läuft', pause: 'Zeit für eine kurze Pause', 'lange-pause': 'Zeit für eine lange Pause', fertig: 'Alle Runden geschafft 🎉' };

/**
 * Der Fokus-Timer läuft global weiter – auch beim Seitenwechsel und nach dem Neuladen
 * (der Zustand liegt im Browser dieses Geräts).
 */
export function FocusProvider({ children }: { children: ReactNode }) {
  const { add } = useStore();
  const { show } = useToast();
  const [timer, setTimer] = useState<FocusTimer>(load);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(timer));
    } catch {
      // Speicher voll o. Ä.
    }
  }, [timer]);

  const save = useCallback((s: Omit<FocusSession, 'id' | 'date'>) => add('sessions', { ...s, date: today() }), [add]);

  // Takt: Restzeit aktualisieren und Phasenwechsel erkennen
  useEffect(() => {
    if (!timer.running) return;
    const step = () => {
      const t = Date.now();
      setNow(t);
      const r = tick(timerRef.current, t);
      if (r.finished.length === 0) return;
      timerRef.current = r.timer;
      r.finished.forEach((f) => f.session && save(f.session));
      setTimer(r.timer);
      const last = r.finished[r.finished.length - 1];
      chime();
      show(`${focusMode(r.timer.config.mode).icon} ${NEXT_TEXT[last.next]}`, undefined, 6000);
      if (document.hidden) void notify('AntonOS Fokus', NEXT_TEXT[last.next], 'fokus');
    };
    step();
    const id = setInterval(step, 500);
    return () => clearInterval(id);
  }, [timer.running, timer.endAt, save, show]);

  const left = remainingMs(timer, now);
  const total = phaseMinutes(timer.config, timer.phase) * 60_000;
  const progress = timer.active && total > 0 ? 1 - left / total : 0;

  // Restzeit im Tab-Titel
  useEffect(() => {
    document.title = timer.active ? `${mmss(left)} · ${timer.phase === 'fokus' ? focusMode(timer.config.mode).label : 'Pause'}` : 'AntonOS';
  }, [timer.active, timer.phase, timer.config.mode, left]);

  const value: FocusCtx = {
    timer,
    left,
    progress,
    start: () => {
      const t = Date.now();
      setNow(t);
      setTimer((x) => startTimer(x, t));
    },
    pause: () => setTimer((x) => pauseTimer(x, Date.now())),
    stop: (keep) => {
      const r = stopTimer(timerRef.current, Date.now(), keep);
      if (r.session) save(r.session);
      setTimer(r.timer);
    },
    skip: () => setTimer((x) => skipTimer(x, Date.now())),
    distract: () => setTimer((x) => ({ ...x, distractions: x.distractions + 1 })),
    configure: (patch) =>
      setTimer((x) => {
        const config = { ...x.config, ...patch };
        // Läuft nichts, passt sich die angezeigte Zeit sofort an
        return x.active ? { ...x, config } : idleTimer(config);
      }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Großer runder Timer mit Fortschrittsring in der Modusfarbe */
export function TimerRing({ size = 260, children }: { size?: number; children?: ReactNode }) {
  const { timer, progress } = useFocus();
  const mode = focusMode(timer.config.mode);
  const sw = Math.round(size / 26);
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const color = timer.phase === 'fokus' ? mode.color : '#34C759';
  return (
    <div className="timer-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0, 1 - progress) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.5s linear' }}
        />
      </svg>
      <div className="timer-ring-inner">{children}</div>
    </div>
  );
}

/** Schwebende „Live-Aktivität“ auf allen Seiten, solange ein Timer aktiv ist */
export function FocusPill({ hidden }: { hidden?: boolean }) {
  const { timer, left, start, pause } = useFocus();
  const { data } = useStore();
  if (!timer.active || hidden) return null;
  const mode = focusMode(timer.config.mode);
  const course = data.courses.find((c) => c.id === timer.config.courseId);
  const label = timer.phase === 'fokus' ? `Fokus · ${mode.label}` : timer.phase === 'pause' ? 'Kurze Pause' : 'Lange Pause';
  return (
    <div className="focus-pill" role="status" style={{ ['--mode' as string]: timer.phase === 'fokus' ? mode.color : '#34C759' }}>
      <a href="#/fokus" className="focus-pill-main">
        <span className="focus-pill-icon" aria-hidden>{timer.phase === 'fokus' ? mode.icon : '☕'}</span>
        <span className="focus-pill-text">
          <span className="focus-pill-label">{label}</span>
          {course && timer.phase === 'fokus' && <span className="focus-pill-sub">{course.name}</span>}
        </span>
        <span className="focus-pill-time">{mmss(left)}</span>
      </a>
      <button type="button" className="focus-pill-btn" onClick={timer.running ? pause : start} aria-label={timer.running ? 'Pausieren' : 'Fortsetzen'}>
        {timer.running ? '❚❚' : '▶'}
      </button>
    </div>
  );
}

/** Kleines Dashboard-Widget */
export function FocusWidget() {
  const { timer, left, start, pause } = useFocus();
  const mode = focusMode(timer.config.mode);
  return (
    <div className="focus-widget">
      <TimerRing size={120}>
        <span className="focus-widget-time">{mmss(left)}</span>
        <span className="muted small">{timer.active ? (timer.phase === 'fokus' ? `Runde ${timer.round}/${timer.config.rounds}` : 'Pause') : mode.label}</span>
      </TimerRing>
      <div className="row center">
        <button type="button" className={`round-btn ${timer.running ? 'pause' : 'go'}`} onClick={timer.running ? pause : start}>
          {timer.running ? 'Pause' : timer.active ? 'Weiter' : 'Start'}
        </button>
      </div>
    </div>
  );
}
