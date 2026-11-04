import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Pause, Play, SkipForward } from 'lucide-react';
import { newId, useStore } from '../store';
import type { ID, Routine, RoutineRun, RoutineStep } from '../types';
import { today } from '../lib/dates';
import { mmss } from '../lib/focus';
import { bump, success, tap } from '../lib/haptics';
import { cancelRoutineNotices, isNativeApp, planRoutineNotices } from '../lib/native';
import { notify } from '../lib/notify';
import {
  currentStep, extendStep, habitCheck, isFinished, MAX_RUNS, nextStep, pauseRun, resumeRun, routineMinutes, routineStreak, runSummary, startRun, stepDuration, stepEnd,
  stepLeft, stepShare, syncRun, upcoming, type RoutineRunState,
} from '../lib/routines';
import { chime } from './focus';
import { useNow } from './rest';

const KEY = 'antonos:routine';

interface Finished {
  routine: Routine;
  summary: RoutineRun;
  streak: number;
}

interface RoutineCtx {
  run: RoutineRunState | null;
  routine: Routine | null;
  /** Vollbild mit dem großen Ring offen */
  open: boolean;
  setOpen(open: boolean): void;
  start(id: ID): void;
  /** Schritt erledigt */
  done(): void;
  skip(): void;
  /** Mehr Zeit für den Schritt (Standard 1 Min.) */
  extend(seconds?: number): void;
  /** Pause bzw. weiter */
  toggle(): void;
  stop(): void;
  finished: Finished | null;
  closeFinished(): void;
}

const Ctx = createContext<RoutineCtx | null>(null);

export function useRoutine(): RoutineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRoutine außerhalb des RoutineProvider');
  return ctx;
}

function load(): RoutineRunState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // Länger als zwölf Stunden alte Durchläufe sind vergessen
    if (raw && typeof raw.routineId === 'string' && typeof raw.stepStart === 'number' && raw.startedAt > Date.now() - 12 * 3_600_000) return raw;
  } catch {
    // kaputter Eintrag
  }
  return null;
}

/**
 * Geführte Routine: läuft global (auch nach dem Neuladen), geht Schritt für Schritt weiter,
 * meldet jeden Wechsel mit Ton und Vibration (gesperrt per System-Mitteilung) und hakt Gewohnheiten ab.
 */
export function RoutineProvider({ children }: { children: ReactNode }) {
  const { data, mutate } = useStore();
  const [run, setRun] = useState<RoutineRunState | null>(load);
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);
  const routine = run ? data.routines.find((r) => r.id === run.routineId) ?? null : null;
  const ref = useRef({ run, routine });
  ref.current = { run, routine };

  useEffect(() => {
    try {
      if (run) localStorage.setItem(KEY, JSON.stringify(run));
      else localStorage.removeItem(KEY);
    } catch {
      // Speicher voll o. Ä.
    }
  }, [run]);

  // Gelöschte Routine: Durchlauf beenden
  useEffect(() => {
    if (run && !routine) setRun(null);
  }, [run, routine]);

  /** Passende Gewohnheiten der erledigten Schritte abhaken */
  const checkHabits = useCallback((steps: RoutineStep[]) => {
    const ids = steps.map((s) => s.habitId).filter((x): x is ID => !!x);
    if (!ids.length) return;
    const day = today();
    mutate((d) => {
      let logs = d.habitLogs;
      for (const id of ids) {
        const habit = d.habits.find((h) => h.id === id);
        const change = habit ? habitCheck(habit, logs, day) : null;
        if (change?.add) logs = [...logs, { ...change.add, id: newId() }];
        else if (change?.update) logs = logs.map((l) => (l.id === change.update!.id ? { ...l, amount: change.update!.amount } : l));
      }
      return logs === d.habitLogs ? d : { ...d, habitLogs: logs };
    });
  }, [mutate]);

  /** Durchlauf speichern und feiern */
  const finish = useCallback((r: RoutineRunState, rt: Routine, at: number) => {
    const summary = runSummary(r, at);
    const withRun = (runs: RoutineRun[] = []) => [...runs.filter((x) => x.date !== summary.date), summary].slice(-MAX_RUNS);
    const runs = withRun(rt.runs);
    mutate((d) => ({ ...d, routines: d.routines.map((x) => (x.id === rt.id ? { ...x, runs: withRun(x.runs) } : x)) }));
    setRun(null);
    setFinished({ routine: rt, summary, streak: routineStreak({ runs }, summary.date) });
    setOpen(false);
    success();
  }, [mutate]);

  // Weiterzählen: abgelaufene Schritte gelten als erledigt, Wechsel mit Ton und Vibration
  const ticking = !!run && !run.pausedAt;
  useEffect(() => {
    if (!ticking) return;
    let quietFor = -1;
    const tick = () => {
      const { run: r, routine: rt } = ref.current;
      if (!r || !rt) return;
      const now = Date.now();
      const end = stepEnd(r, rt);
      // App ist offen: die Mitteilung zum nächsten Wechsel zurückziehen, hier gibt es Ton und Vibration
      if (end !== null && end - now < 1500 && end - now > 0 && !document.hidden && quietFor !== end) {
        quietFor = end;
        void cancelRoutineNotices(true);
      }
      const { run: next, advanced } = syncRun(r, rt, now);
      if (!advanced.length) return;
      checkHabits(advanced);
      const lastEnd = next.stepStart;
      if (now - lastEnd < 3000) {
        if (!document.hidden) {
          chime();
          bump();
        } else if (!isNativeApp()) {
          // Browser im Hintergrund: Mitteilung statt Ton (in der iPhone-App sind sie schon beim System geplant)
          const step = currentStep(next, rt);
          void notify(step ? `Weiter: ${step.icon} ${step.title}` : `✅ ${rt.name} geschafft`, rt.name, 'routine');
        }
      }
      if (isFinished(next, rt)) finish(next, rt, Math.min(now, lastEnd));
      else setRun(next);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [ticking, checkHabits, finish]);

  // iPhone: alle kommenden Wechsel beim System anmelden (neu bei jeder Änderung)
  const planKey = run && routine ? [run.routineId, run.index, run.stepStart, run.extra, run.pausedAt ?? '', routine.steps.length].join('|') : '';
  useEffect(() => {
    if (!isNativeApp()) return;
    const { run: r, routine: rt } = ref.current;
    if (!r || !rt || r.pausedAt) {
      void cancelRoutineNotices();
      return;
    }
    const n = rt.steps.length;
    void planRoutineNotices(
      upcoming(r, rt, Date.now()).map((x) => {
        const k = x.step ? rt.steps.indexOf(x.step) + 1 : n;
        return x.step
          ? { at: x.at, title: `Weiter: ${x.step.icon} ${x.step.title}`, body: `${rt.name} · Schritt ${k} von ${n} · ${x.step.minutes > 0 ? `${x.step.minutes} Min.` : 'zum Abhaken'}` }
          : { at: x.at, title: `✅ ${rt.name} geschafft`, body: 'Alle Schritte erledigt – stark!' };
      }),
    );
  }, [planKey]);

  const start = useCallback((id: ID) => {
    setFinished(null);
    setRun((cur) => (cur && cur.routineId === id ? cur : startRun({ id }, Date.now())));
    setOpen(true);
    tap();
  }, []);

  const advance = useCallback((how: 'done' | 'skip') => {
    const { run: stale, routine: rt } = ref.current;
    if (!stale || !rt) return;
    const now = Date.now();
    // Ist die Zeit des Schritts schon um (z. B. Tipp in der Live-Aktivität nach dem Sperren), ging es von selbst weiter –
    // dann zählt der Tipp nicht noch für den nächsten Schritt
    const synced = syncRun(stale, rt, now);
    if (synced.advanced.length) {
      checkHabits(synced.advanced);
      if (isFinished(synced.run, rt)) finish(synced.run, rt, synced.run.stepStart);
      else setRun(synced.run);
      return;
    }
    const r = stale;
    const step = currentStep(r, rt);
    if (how === 'done' && step) checkHabits([step]);
    const next = nextStep(r, rt, how, now);
    if (!next || isFinished(next, rt)) {
      if (next) finish(next, rt, now);
      return;
    }
    setRun(next);
    bump();
  }, [checkHabits, finish]);

  const value = useMemo<RoutineCtx>(() => ({
    run,
    routine,
    open: open && !!run,
    setOpen,
    start,
    done: () => advance('done'),
    skip: () => advance('skip'),
    extend: (seconds = 60) => {
      const { routine: rt } = ref.current;
      if (rt) setRun((r) => (r ? extendStep(r, rt, seconds, Date.now()) : r));
      tap();
    },
    toggle: () => {
      setRun((r) => (r ? (r.pausedAt ? resumeRun(r, Date.now()) : pauseRun(r, Date.now())) : r));
      tap();
    },
    stop: () => {
      setRun(null);
      setOpen(false);
      void cancelRoutineNotices();
    },
    finished,
    closeFinished: () => setFinished(null),
  }), [run, routine, open, start, advance, finished]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <RoutineOverlay />
    </Ctx.Provider>
  );
}

/** Großer Ring: zählt den Schritt herunter */
function Ring({ share, color, children }: { share: number; color: string; children: ReactNode }) {
  const r = 118;
  const c = 2 * Math.PI * r;
  return (
    <div className="rt-ring" style={{ ['--c' as string]: color }}>
      <svg viewBox="0 0 260 260" aria-hidden>
        <circle cx="130" cy="130" r={r} className="rt-ring-track" />
        <circle cx="130" cy="130" r={r} className="rt-ring-bar" strokeDasharray={c} strokeDashoffset={c * Math.min(1, Math.max(0, share))} />
      </svg>
      <div className="rt-ring-inner">{children}</div>
    </div>
  );
}

function Runner() {
  const ctx = useRoutine();
  const { run, routine } = ctx;
  const now = useNow(!!run && !run.pausedAt, 250);
  const { data } = useStore();
  if (!run || !routine) return null;
  const step = currentStep(run, routine);
  if (!step) return null;
  const timed = stepDuration(run, routine) > 0;
  const left = stepLeft(run, routine, now);
  const share = timed ? stepShare(run, routine, now) : 0;
  const next = routine.steps[run.index + 1];
  const habit = step.habitId ? data.habits.find((h) => h.id === step.habitId) : undefined;
  const paused = !!run.pausedAt;
  return (
    <div className="rt-runner" role="dialog" aria-modal="true" aria-label={routine.name} style={{ ['--c' as string]: routine.color }}>
      <header className="rt-top">
        <button type="button" className="rt-min" onClick={() => ctx.setOpen(false)} aria-label="Verkleinern"><ChevronDown size={20} /></button>
        <strong>{routine.icon} {routine.name}</strong>
        <button type="button" className="rt-end" onClick={() => ctx.stop()}>Beenden</button>
      </header>
      <div className="rt-dots" aria-label={`Schritt ${run.index + 1} von ${routine.steps.length}`}>
        {routine.steps.map((s, i) => (
          <span key={s.id} className={i < run.index ? (run.skipped.includes(s.id) ? 'skip' : 'done') : i === run.index ? 'on' : ''}>
            {i === run.index && <i style={{ width: `${(timed ? share : 0) * 100}%` }} />}
          </span>
        ))}
      </div>
      <div className="rt-stage">
        <Ring share={timed ? share : 0} color={routine.color}>
          <span className="rt-step-icon" aria-hidden>{step.icon}</span>
          <strong className="rt-time" aria-live="off">{timed ? mmss(left) : '✓'}</strong>
          <span className="rt-step-title">{step.title}</span>
          {paused && <small className="rt-paused">pausiert</small>}
        </Ring>
        {habit && <p className="rt-habit">✨ hakt „{habit.name}“ ab</p>}
        <p className="rt-next">{next ? <>Als Nächstes: <strong>{next.icon} {next.title}</strong>{next.minutes > 0 ? ` · ${next.minutes} Min.` : ''}</> : 'Letzter Schritt 💪'}</p>
      </div>
      <div className={`rt-controls ${timed ? '' : 'untimed'}`}>
        {timed ? <button type="button" className="rt-round" onClick={() => ctx.extend(60)} aria-label="Eine Minute mehr">+1<small>Min.</small></button> : <span />}
        {timed && (
          <button type="button" className="rt-main rt-pause" onClick={() => ctx.toggle()} aria-label={paused ? 'Weiter' : 'Pause'}>
            {paused ? <Play size={30} fill="currentColor" /> : <Pause size={30} fill="currentColor" />}
          </button>
        )}
        <button type="button" className="rt-main rt-done" onClick={() => ctx.done()} aria-label="Schritt erledigt"><Check size={34} strokeWidth={3} /></button>
        <button type="button" className="rt-round" onClick={() => ctx.skip()} aria-label="Überspringen"><SkipForward size={20} /><small>Überspr.</small></button>
      </div>
    </div>
  );
}

function FinishedCard() {
  const { finished, closeFinished } = useRoutine();
  if (!finished) return null;
  const { routine, summary, streak } = finished;
  return (
    <div className="rt-runner rt-finished" role="dialog" aria-modal="true" aria-label={`${routine.name} geschafft`} style={{ ['--c' as string]: routine.color }}>
      <div className="rt-stage">
        <span className="rt-badge" aria-hidden>{routine.icon}</span>
        <h2>{routine.name} geschafft!</h2>
        <p className="rt-sum">{summary.minutes} Min. · {summary.done} von {summary.done + summary.skipped} Schritten{summary.skipped ? ` · ${summary.skipped} übersprungen` : ''}</p>
        {streak > 1 && <p className="rt-streak">🔥 {streak} Tage in Folge</p>}
      </div>
      <div className="rt-controls single">
        <button type="button" className="primary rt-close" onClick={closeFinished}>Fertig</button>
      </div>
    </div>
  );
}

/** Kleine Leiste, solange die Routine im Hintergrund läuft */
function Pill() {
  const { run, routine, open, setOpen } = useRoutine();
  const now = useNow(!!run && !open, 1000);
  if (!run || !routine || open) return null;
  const step = currentStep(run, routine);
  if (!step) return null;
  const timed = stepDuration(run, routine) > 0;
  return (
    <button type="button" className="rt-pill" style={{ ['--c' as string]: routine.color }} onClick={() => setOpen(true)} aria-label={`${routine.name} öffnen`}>
      <span aria-hidden>{step.icon}</span>
      <span className="rt-pill-title">{step.title}</span>
      <strong>{run.pausedAt ? '❚❚' : timed ? mmss(stepLeft(run, routine, now)) : 'abhaken'}</strong>
    </button>
  );
}

function RoutineOverlay() {
  const { open, finished } = useRoutine();
  return createPortal(
    <>
      {open && <Runner />}
      {finished && <FinishedCard />}
      <Pill />
    </>,
    document.body,
  );
}

/** „Heute“: die Routine zur Tageszeit – bzw. die gerade laufende mit Schritt und Restzeit */
export function RoutineToday({ routine }: { routine: Routine }) {
  const { run, start } = useRoutine();
  const here = run?.routineId === routine.id ? run : null;
  const now = useNow(!!here && !here.pausedAt, 1000);
  const t = today();
  const streak = routineStreak(routine, t);
  const step = here ? currentStep(here, routine) : null;
  const timed = here ? stepDuration(here, routine) > 0 : false;
  const share = here ? (here.index + (timed ? stepShare(here, routine, now) : 0)) / routine.steps.length : 0;
  return (
    <button type="button" className={`rt-today ${here ? 'running' : ''}`} style={{ ['--c' as string]: routine.color, ['--p' as string]: share }} onClick={() => start(routine.id)}>
      <span className="rt-today-icon" aria-hidden><span>{routine.icon}</span></span>
      <span className="grow rt-today-text">
        {here && step ? (
          <>
            <small>{routine.name} · Schritt {here.index + 1} von {routine.steps.length}</small>
            <strong>{step.icon} {step.title}</strong>
          </>
        ) : (
          <>
            <strong>{routine.name}</strong>
            <small>{routine.steps.length} Schritte · {routineMinutes(routine).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Min.{streak > 0 ? ` · 🔥 ${streak}` : ''}</small>
            <span className="rt-today-steps" aria-hidden>{routine.steps.map((s) => s.icon).join(' ')}</span>
          </>
        )}
      </span>
      <span className="rt-today-go">{here ? (here.pausedAt ? '❚❚' : timed ? mmss(stepLeft(here, routine, now)) : 'abhaken') : '▶ Los'}</span>
    </button>
  );
}
