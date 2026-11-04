import type { DateStr, Habit, HabitLog, ID, Routine, RoutineRun, RoutineStep } from '../types';
import { addDays, toDateStr } from './dates';
import { habitSteps, isHabitDone } from './life';
import type { FocusActivityState } from './native';

/* ---------- Vorlagen ---------- */

export interface RoutineTemplate {
  name: string;
  icon: string;
  color: string;
  when: Routine['when'];
  steps: Pick<RoutineStep, 'title' | 'icon' | 'minutes'>[];
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    name: 'Morgenroutine', icon: '🌅', color: '#FF9500', when: 'morgen',
    steps: [{ title: 'Wasser trinken', icon: '💧', minutes: 1 }, { title: 'Dehnen', icon: '🧘', minutes: 5 }, { title: 'Duschen', icon: '🚿', minutes: 10 }, { title: 'Plan ansehen', icon: '🗓️', minutes: 2 }],
  },
  {
    name: 'Abendroutine', icon: '🌙', color: '#5856D6', when: 'abend',
    steps: [{ title: 'Aufräumen', icon: '🧺', minutes: 5 }, { title: 'Tagesrückblick', icon: '📝', minutes: 3 }, { title: 'Lesen', icon: '📖', minutes: 15 }, { title: 'Zähne putzen', icon: '🪥', minutes: 3 }],
  },
  {
    name: 'Lernroutine', icon: '📚', color: '#30B0C7', when: 'tag',
    steps: [{ title: 'Schreibtisch frei machen', icon: '🧹', minutes: 2 }, { title: 'Ziel der Session aufschreiben', icon: '🎯', minutes: 1 }, { title: 'Handy weglegen', icon: '📵', minutes: 0 }, { title: 'Konzentriert lernen', icon: '🧠', minutes: 25 }, { title: 'Kurze Pause', icon: '☕️', minutes: 5 }],
  },
];

export const ROUTINE_COLORS = ['#FF9500', '#5856D6', '#30B0C7', '#34C759', '#FF2D55', '#AF52DE', '#007AFF', '#A2845E'];

const words = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zäöüß\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);

/** Passende Gewohnheit zu einem Schritt: ein gemeinsames Wort (ab vier Buchstaben), z. B. „Wasser trinken“ ↔ „2 Liter Wasser“ */
export function matchHabit(title: string, habits: Pick<Habit, 'id' | 'name'>[]): ID | null {
  const mine = new Set(words(title));
  if (!mine.size) return null;
  return habits.find((h) => words(h.name).some((w) => mine.has(w)))?.id ?? null;
}

/** Neue Routine aus einer Vorlage – Schritte mit passenden Gewohnheiten werden gleich verknüpft */
export function fromTemplate(tpl: RoutineTemplate, habits: Pick<Habit, 'id' | 'name'>[], makeId: () => ID): Omit<Routine, 'id'> {
  return {
    name: tpl.name,
    icon: tpl.icon,
    color: tpl.color,
    when: tpl.when,
    steps: tpl.steps.map((s) => ({ ...s, id: makeId(), habitId: matchHabit(s.title, habits) })),
    runs: [],
  };
}

/* ---------- Kennzahlen ---------- */

export const routineMinutes = (r: { steps: Pick<RoutineStep, 'minutes'>[] }): number => r.steps.reduce((s, x) => s + Math.max(0, x.minutes), 0);

/** Tage in Folge mit einem Durchlauf bis heute (ist heute noch offen, zählt die Serie bis gestern) */
export function routineStreak(r: Pick<Routine, 'runs'>, today: DateStr): number {
  const days = new Set((r.runs ?? []).map((x) => x.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const ranToday = (r: Pick<Routine, 'runs'>, today: DateStr) => (r.runs ?? []).some((x) => x.date === today);

/** Höchstens so viele Durchläufe bleiben gespeichert */
export const MAX_RUNS = 90;

/** Routine, die „Heute“ zur Tageszeit anbietet: passend zur Tageszeit und heute noch nicht gemacht */
export function suggestedRoutine(routines: Routine[], phase: 'morgen' | 'tag' | 'abend', today: DateStr): Routine | null {
  return routines.find((r) => r.when === phase && r.steps.length > 0 && !ranToday(r, today)) ?? null;
}

/* ---------- Ablauf ---------- */

/** Laufende Routine – liegt im Gerät, damit sie Neuladen und Sperren übersteht */
export interface RoutineRunState {
  routineId: ID;
  /** Aktueller Schritt */
  index: number;
  /** Beginn des aktuellen Schritts (ms); beim Fortsetzen um die Pause verschoben */
  stepStart: number;
  /** Zusätzliche Sekunden für den aktuellen Schritt („+1 Min.“) */
  extra: number;
  startedAt: number;
  /** Pausiert seit (ms) */
  pausedAt: number | null;
  done: ID[];
  skipped: ID[];
}

export function startRun(routine: Pick<Routine, 'id'>, now: number): RoutineRunState {
  return { routineId: routine.id, index: 0, stepStart: now, extra: 0, startedAt: now, pausedAt: null, done: [], skipped: [] };
}

export const currentStep = (run: RoutineRunState, routine: Pick<Routine, 'steps'>): RoutineStep | null => routine.steps[run.index] ?? null;

/** Dauer des aktuellen Schritts in ms (0 = ohne Uhr) */
export function stepDuration(run: RoutineRunState, routine: Pick<Routine, 'steps'>): number {
  const step = currentStep(run, routine);
  return step && step.minutes > 0 ? (step.minutes * 60 + run.extra) * 1000 : 0;
}

/** Ende des aktuellen Schritts (ms) – null ohne Uhr */
export function stepEnd(run: RoutineRunState, routine: Pick<Routine, 'steps'>): number | null {
  const d = stepDuration(run, routine);
  return d ? run.stepStart + d : null;
}

/** Restzeit des Schritts in ms (pausiert eingefroren, ohne Uhr 0) */
export function stepLeft(run: RoutineRunState, routine: Pick<Routine, 'steps'>, now: number): number {
  const end = stepEnd(run, routine);
  if (end === null) return 0;
  return Math.max(0, end - (run.pausedAt ?? now));
}

/** Fortschritt des Schritts 0–1 */
export function stepShare(run: RoutineRunState, routine: Pick<Routine, 'steps'>, now: number): number {
  const d = stepDuration(run, routine);
  return d ? 1 - stepLeft(run, routine, now) / d : 0;
}

/** Nächster Schritt: aktueller ist erledigt bzw. übersprungen; null = Routine fertig */
export function nextStep(run: RoutineRunState, routine: Pick<Routine, 'steps'>, how: 'done' | 'skip', now: number): RoutineRunState | null {
  const step = currentStep(run, routine);
  if (!step) return null;
  const next = {
    ...run,
    index: run.index + 1,
    stepStart: now,
    extra: 0,
    pausedAt: null,
    done: how === 'done' ? [...run.done, step.id] : run.done,
    skipped: how === 'skip' ? [...run.skipped, step.id] : run.skipped,
  };
  return next.index >= routine.steps.length ? { ...next, index: routine.steps.length } : next;
}

export const isFinished = (run: RoutineRunState, routine: Pick<Routine, 'steps'>) => run.index >= routine.steps.length;

/**
 * Holt die Zeit nach: Schritte mit Uhr, deren Zeit um ist, gelten als erledigt, der nächste beginnt
 * genau an ihrem Ende (auch wenn das Handy gesperrt war). Bei einem Schritt ohne Uhr wird gewartet.
 */
export function syncRun(run: RoutineRunState, routine: Pick<Routine, 'steps'>, now: number): { run: RoutineRunState; advanced: RoutineStep[] } {
  let cur = run;
  const advanced: RoutineStep[] = [];
  while (!cur.pausedAt && !isFinished(cur, routine)) {
    const end = stepEnd(cur, routine);
    if (end === null || end > now) break;
    advanced.push(currentStep(cur, routine)!);
    cur = nextStep(cur, routine, 'done', end)!;
  }
  return { run: cur, advanced };
}

export function pauseRun(run: RoutineRunState, now: number): RoutineRunState {
  return run.pausedAt ? run : { ...run, pausedAt: now };
}

export function resumeRun(run: RoutineRunState, now: number): RoutineRunState {
  return run.pausedAt ? { ...run, stepStart: run.stepStart + (now - run.pausedAt), pausedAt: null } : run;
}

/** „+1 Min.“ – nach Ablauf der Zeit zählt sie ab jetzt */
export function extendStep(run: RoutineRunState, routine: Pick<Routine, 'steps'>, seconds: number, now: number): RoutineRunState {
  const end = stepEnd(run, routine);
  if (end === null) return run;
  if (!run.pausedAt && end < now) return { ...run, stepStart: now, extra: seconds - (currentStep(run, routine)!.minutes * 60) };
  return { ...run, extra: run.extra + seconds };
}

/** Durchlauf zum Speichern */
export function runSummary(run: RoutineRunState, now: number): RoutineRun {
  return { date: toDateStr(new Date(run.startedAt)), minutes: Math.max(1, Math.round((now - run.startedAt) / 60_000)), done: run.done.length, skipped: run.skipped.length };
}

/** Uhrzeiten der nächsten Schritte, wenn alles nach Plan läuft (für Sperrbildschirm und Mitteilungen) */
export function upcoming(run: RoutineRunState, routine: Pick<Routine, 'steps'>, now: number): { at: number; step: RoutineStep | null }[] {
  const out: { at: number; step: RoutineStep | null }[] = [];
  const end = stepEnd(run, routine);
  if (end === null || run.pausedAt) return out;
  let at = end;
  for (let i = run.index + 1; i <= routine.steps.length; i++) {
    const step = routine.steps[i] ?? null;
    out.push({ at, step });
    // Ein Schritt ohne Uhr hält an – was danach kommt, ist noch offen
    if (!step || step.minutes <= 0) break;
    at += step.minutes * 60_000;
  }
  return out.filter((x) => x.at > now - 1000);
}

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Live-Aktivität: Countdown des Schritts, darunter die nächsten Schritte mit Uhrzeit – die stimmen auch bei gesperrtem Handy */
export function routineActivityState(run: RoutineRunState, routine: Routine, now: number): FocusActivityState | null {
  const step = currentStep(run, routine);
  if (!step) return null;
  const duration = stepDuration(run, routine);
  const left = stepLeft(run, routine, now);
  const endAt = duration ? (run.pausedAt ? now + left : run.stepStart + duration) : now;
  const next = upcoming(run, routine, now).filter((x) => x.step).slice(0, 3);
  const untimed = !duration;
  const lines = next.length
    ? next.map((x) => `${clock(x.at)} ${x.step!.icon} ${x.step!.title}`)
    : routine.steps[run.index + 1]
      ? [`Danach: ${routine.steps[run.index + 1].icon} ${routine.steps[run.index + 1].title}`]
      : ['Letzter Schritt'];
  return {
    label: routine.name,
    icon: routine.icon,
    color: routine.color,
    phase: 'routine',
    startAt: untimed ? now : endAt - duration,
    endAt,
    paused: !!run.pausedAt || untimed,
    leftSeconds: Math.ceil(left / 1000),
    round: run.index + 1,
    rounds: routine.steps.length,
    detail: lines.join('\n'),
    goal: `${step.icon} ${step.title}${untimed ? ' – abhaken' : ''}`,
  };
}

/* ---------- Gewohnheiten ---------- */

/**
 * Was ein erledigter Schritt an seiner Gewohnheit ändert: ohne Menge einfach abhaken,
 * bei Mengen-Gewohnheiten (z. B. 2 l Wasser) eine Portion dazu. null = schon erledigt.
 */
export function habitCheck(habit: Habit, logs: HabitLog[], day: DateStr): { add?: Omit<HabitLog, 'id'>; update?: { id: ID; amount: number } } | null {
  if (isHabitDone(logs, habit, day)) return null;
  const log = logs.find((l) => l.habitId === habit.id && l.date === day);
  if (!habit.target) return log ? null : { add: { habitId: habit.id, date: day } };
  const portion = habitSteps(habit)[0] ?? habit.target;
  const amount = Math.round(((log?.amount ?? 0) + portion) * 1000) / 1000;
  return log ? { update: { id: log.id, amount } } : { add: { habitId: habit.id, date: day, amount } };
}
