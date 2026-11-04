import type { DateStr, ID } from '../types';
import type { FocusActivityState } from './native';

/** Satzpause beim Training: läuft auch weiter, wenn die App kurz im Hintergrund ist */
export interface RestTimer {
  /** Beginn und Ende der Pause (ms) */
  startAt: number;
  endAt: number;
  /** Übung, deren Satz gerade fertig ist */
  exercise: string;
  /** Was als Nächstes kommt, z. B. „Bankdrücken · Satz 3 von 4“ */
  next: string;
  /** Ziel für den nächsten Satz, z. B. „62,5 kg × 8“ */
  goal: string;
}

export const REST_CHOICES = [60, 90, 120, 180] as const;
export const DEFAULT_REST = 90;

export function startRest(now: number, seconds: number, info: Pick<RestTimer, 'exercise' | 'next' | 'goal'>): RestTimer {
  return { ...info, startAt: now, endAt: now + Math.max(5, seconds) * 1000 };
}

/** +30 s: verlängert die laufende Pause (eine abgelaufene beginnt neu ab jetzt) */
export function extendRest(timer: RestTimer, seconds: number, now: number): RestTimer {
  const base = Math.max(timer.endAt, now);
  return { ...timer, startAt: timer.endAt < now ? now : timer.startAt, endAt: base + seconds * 1000 };
}

export const restLeft = (timer: RestTimer, now: number) => Math.max(0, timer.endAt - now);

/** Anteil der Pause, der schon vorbei ist (0–1) */
export function restProgress(timer: RestTimer, now: number): number {
  const total = timer.endAt - timer.startAt;
  return total > 0 ? Math.min(1, Math.max(0, (now - timer.startAt) / total)) : 1;
}

/** Stand für die Live-Aktivität (dieselbe wie beim Fokus-Timer, Phase „satzpause“) */
export function restActivityState(timer: RestTimer, now: number): FocusActivityState {
  return {
    label: 'Satzpause',
    icon: '🏋️',
    color: '#FF9F0A',
    phase: 'satzpause',
    startAt: timer.startAt,
    endAt: timer.endAt,
    paused: false,
    leftSeconds: Math.ceil(restLeft(timer, now) / 1000),
    round: 0,
    rounds: 0,
    detail: timer.next ? `Als Nächstes: ${timer.next}` : timer.exercise,
    goal: timer.goal ? `Ziel: ${timer.goal}` : '',
  };
}

/** Position des nächsten offenen Satzes nach Übung `row`, Satz `set` – erst in derselben Übung, dann in den folgenden */
export function nextOpenSet(rows: { sets: { done?: boolean }[] }[], row: number, set: number): { row: number; set: number } | null {
  for (let i = row; i < rows.length; i++) {
    const start = i === row ? set + 1 : 0;
    for (let k = start; k < rows[i].sets.length; k++) if (!rows[i].sets[k].done) return { row: i, set: k };
  }
  // Übersprungene Sätze weiter oben
  for (let i = 0; i <= row && i < rows.length; i++) {
    for (let k = 0; k < rows[i].sets.length; k++) if (!rows[i].sets[k].done && !(i === row && k === set)) return { row: i, set: k };
  }
  return null;
}

/** „Bankdrücken · Satz 3 von 4“ */
export const setLabel = (name: string, set: number, of: number) => `${name} · Satz ${set + 1} von ${of}`;

/* ---------- Laufendes Training ---------- */

/** Ein Satz im laufenden Training, so wie in den Eingabefeldern */
export interface DraftSet {
  w: string;
  r: string;
  done?: boolean;
}

/** Laufendes Training: bleibt erhalten, wenn die App zwischendurch zu ist */
export interface WorkoutDraft {
  dayId: ID;
  date: DateStr;
  /** Wann der erste Satz abgehakt wurde (ms) – daraus wird die Dauer vorgeschlagen */
  startedAt: number | null;
  minutes: string;
  notes: string;
  rows: { exerciseId: ID; sets: DraftSet[] }[];
}

const isText = (x: unknown): x is string => typeof x === 'string';

/** Liest einen gespeicherten Entwurf; kaputte oder fremde Daten → null */
export function parseDraft(raw: unknown): WorkoutDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<WorkoutDraft>;
  if (!isText(d.dayId) || !isText(d.date) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.rows)) return null;
  const rows = d.rows
    .filter((r) => r && isText(r.exerciseId) && Array.isArray(r.sets))
    .map((r) => ({
      exerciseId: r.exerciseId,
      sets: r.sets.filter((x) => x && isText(x.w) && isText(x.r)).map((x) => ({ w: x.w, r: x.r, ...(x.done ? { done: true } : {}) })),
    }));
  return {
    dayId: d.dayId,
    date: d.date,
    startedAt: typeof d.startedAt === 'number' && Number.isFinite(d.startedAt) ? d.startedAt : null,
    minutes: isText(d.minutes) ? d.minutes : '',
    notes: isText(d.notes) ? d.notes : '',
    rows,
  };
}

/** Abgehakte Sätze im Entwurf */
export const doneSets = (d: Pick<WorkoutDraft, 'rows'>) => d.rows.reduce((n, r) => n + r.sets.filter((s) => s.done).length, 0);

/** Dauer seit dem ersten Satz in Minuten (mindestens 1), plus ein paar Minuten Aufwärmen davor */
export const minutesSince = (startedAt: number, now: number, warmup = 5) => Math.max(1, Math.round((now - startedAt) / 60_000) + warmup);
