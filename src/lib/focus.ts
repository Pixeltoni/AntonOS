import type { FocusMode, FocusSession, ID, WidgetId } from '../types';

export const FOCUS_MODES: { id: FocusMode; label: string; color: string; icon: string; widgets: WidgetId[] }[] = [
  { id: 'lernen', label: 'Lernen', color: '#5856D6', icon: '📚', widgets: ['focus', 'clock', 'tasks', 'calendar', 'exams', 'courses', 'notes', 'rings', 'music', 'period'] },
  { id: 'arbeiten', label: 'Arbeiten', color: '#FF9500', icon: '💼', widgets: ['focus', 'clock', 'tasks', 'projects', 'calendar', 'notes', 'tools', 'quick', 'music'] },
  { id: 'lesen', label: 'Lesen', color: '#34C759', icon: '📖', widgets: ['focus', 'clock', 'reading', 'notes', 'music'] },
];

export const focusMode = (id: FocusMode | undefined) => FOCUS_MODES.find((m) => m.id === id) ?? FOCUS_MODES[0];

export type FocusPhase = 'fokus' | 'pause' | 'lange-pause';

export interface FocusConfig {
  mode: FocusMode;
  courseId: ID | null;
  /** Minuten pro Fokus-Runde */
  work: number;
  /** kurze Pause in Minuten */
  short: number;
  /** lange Pause nach der letzten Runde (0 = keine) */
  long: number;
  rounds: number;
  /** Pausen und nächste Runden starten von selbst */
  autoStart: boolean;
  /** Im Fokus nur passende Dashboard-Kästen zeigen */
  filterDashboard: boolean;
  /** Aufgabe, an der gearbeitet wird */
  taskId?: ID | null;
}

export interface FocusTimer {
  config: FocusConfig;
  /** false = kein Timer aktiv (Ausgangszustand) */
  active: boolean;
  phase: FocusPhase;
  /** 1-basiert */
  round: number;
  running: boolean;
  /** Zeitpunkt, an dem die laufende Phase endet (ms seit 1970) */
  endAt: number;
  /** Restzeit in ms, während pausiert */
  leftMs: number;
  distractions: number;
}

export const defaultFocusConfig = (): FocusConfig => ({
  mode: 'lernen', courseId: null, work: 25, short: 5, long: 15, rounds: 4, autoStart: true, filterDashboard: true,
});

export const idleTimer = (config: FocusConfig = defaultFocusConfig()): FocusTimer => ({
  config, active: false, phase: 'fokus', round: 1, running: false, endAt: 0, leftMs: config.work * 60_000, distractions: 0,
});

export function phaseMinutes(config: FocusConfig, phase: FocusPhase): number {
  return phase === 'fokus' ? config.work : phase === 'pause' ? config.short : config.long;
}

export function remainingMs(timer: FocusTimer, now: number): number {
  return timer.running ? Math.max(0, timer.endAt - now) : timer.leftMs;
}

export function start(timer: FocusTimer, now: number): FocusTimer {
  const left = timer.active ? timer.leftMs : timer.config.work * 60_000;
  return { ...timer, active: true, running: true, endAt: now + left, leftMs: left };
}

export function pause(timer: FocusTimer, now: number): FocusTimer {
  if (!timer.running) return timer;
  return { ...timer, running: false, leftMs: Math.max(0, timer.endAt - now) };
}

export interface Finished {
  /** Fertige Fokus-Runde, die gespeichert werden soll */
  session?: Omit<FocusSession, 'id' | 'date'>;
  /** Was als Nächstes kommt – für den Hinweis */
  next: FocusPhase | 'fertig';
}

/** Nächste Phase nach dem Ende der aktuellen (ohne Speichern). */
function nextPhase(timer: FocusTimer, endedAt: number): { timer: FocusTimer; next: FocusPhase | 'fertig' } {
  const { config } = timer;
  const run = (phase: FocusPhase, round: number): FocusTimer => {
    const ms = phaseMinutes(config, phase) * 60_000;
    return { ...timer, phase, round, running: config.autoStart, endAt: endedAt + ms, leftMs: ms, distractions: phase === 'fokus' ? 0 : timer.distractions };
  };
  if (timer.phase === 'fokus') {
    if (timer.round < config.rounds) return { timer: config.short > 0 ? run('pause', timer.round) : run('fokus', timer.round + 1), next: config.short > 0 ? 'pause' : 'fokus' };
    if (config.long > 0) return { timer: run('lange-pause', timer.round), next: 'lange-pause' };
    return { timer: idleTimer(config), next: 'fertig' };
  }
  if (timer.phase === 'pause') return { timer: run('fokus', timer.round + 1), next: 'fokus' };
  return { timer: idleTimer(config), next: 'fertig' };
}

/**
 * Prüft, ob die laufende Phase vorbei ist, und schaltet weiter – auch über mehrere
 * Phasen, falls die App zwischendurch geschlossen war. Fertige Fokus-Runden kommen zurück.
 */
export function tick(timer: FocusTimer, now: number): { timer: FocusTimer; finished: Finished[] } {
  const finished: Finished[] = [];
  let t = timer;
  while (t.active && t.running && t.endAt <= now) {
    const ended = t;
    const { timer: next, next: label } = nextPhase(t, t.endAt);
    finished.push({
      session: ended.phase === 'fokus'
        ? { minutes: ended.config.work, courseId: ended.config.courseId, distractions: ended.distractions, mode: ended.config.mode, taskId: ended.config.taskId ?? null }
        : undefined,
      next: label,
    });
    t = next;
  }
  return { timer: t, finished };
}

/** Bricht ab. Bei `save` wird die schon gelernte Zeit der laufenden Fokus-Runde gespeichert. */
export function stop(timer: FocusTimer, now: number, save: boolean): { timer: FocusTimer; session?: Omit<FocusSession, 'id' | 'date'> } {
  const done = Math.round((timer.config.work * 60_000 - remainingMs(timer, now)) / 60_000);
  const session = save && timer.active && timer.phase === 'fokus' && done > 0
    ? { minutes: done, courseId: timer.config.courseId, distractions: timer.distractions, mode: timer.config.mode, taskId: timer.config.taskId ?? null }
    : undefined;
  return { timer: idleTimer(timer.config), session };
}

/** Pause überspringen bzw. Runde vorzeitig beenden (ohne Speichern der Pause). */
export function skip(timer: FocusTimer, now: number): FocusTimer {
  if (!timer.active || timer.phase === 'fokus') return timer;
  const { timer: next } = nextPhase(timer, now);
  return { ...next, running: next.active };
}

export const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Minuten pro Kurs und Tag für die gestapelten Wochenbalken. */
export function stackedWeek(sessions: FocusSession[], days: string[]): { date: string; parts: { courseId: ID | null; minutes: number }[]; total: number }[] {
  return days.map((date) => {
    const map = new Map<ID | null, number>();
    for (const s of sessions) if (s.date === date) map.set(s.courseId, (map.get(s.courseId) ?? 0) + s.minutes);
    const parts = [...map].map(([courseId, minutes]) => ({ courseId, minutes })).sort((a, b) => b.minutes - a.minutes);
    return { date, parts, total: parts.reduce((s, p) => s + p.minutes, 0) };
  });
}
